const encoder = new TextEncoder();

const hex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
const sha256 = async (data: BufferSource) => hex(await crypto.subtle.digest("SHA-256", data));
const hmac = async (key: BufferSource, data: string) =>
  crypto.subtle.sign(
    "HMAC",
    await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]),
    encoder.encode(data),
  );

const META = "x-amz-meta-";

// -----
// The few R2Bucket calls the backfill makes (head, get, put), over R2's
// S3 API with an access key, so a script on a person's computer can reach
// the bucket without a Worker. Metadata travels as x-amz-meta-* headers.
// -----
export const r2OverS3 = (accountId: string, bucket: string, accessKeyId: string, secretAccessKey: string) => {
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const call = async (method: string, key: string, headers: Record<string, string> = {}, body?: ArrayBuffer) => {
    const path = `/${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
    const now = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
    const day = now.slice(0, 8);
    const payload = await sha256(body ?? new ArrayBuffer(0));
    const signed: Record<string, string> = {
      ...headers,
      host,
      "x-amz-content-sha256": payload,
      "x-amz-date": now,
    };
    const names = Object.keys(signed)
      .map((name) => name.toLowerCase())
      .toSorted();
    const lower = Object.fromEntries(Object.entries(signed).map(([name, value]) => [name.toLowerCase(), value.trim()]));
    const canonical = [
      method,
      path,
      "",
      ...names.map((name) => `${name}:${lower[name]}`),
      "",
      names.join(";"),
      payload,
    ].join("\n");
    const scope = `${day}/auto/s3/aws4_request`;
    const toSign = `AWS4-HMAC-SHA256\n${now}\n${scope}\n${await sha256(encoder.encode(canonical))}`;
    let derived = await hmac(encoder.encode(`AWS4${secretAccessKey}`), day);
    for (const part of ["auto", "s3", "aws4_request"]) derived = await hmac(derived, part);
    const signature = hex(await hmac(derived, toSign));
    const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}`;
    const { host: _host, ...sent } = signed;
    return fetch(`https://${host}${path}`, { method, headers: { ...sent, authorization }, body });
  };
  const metadataOf = (response: Response) =>
    Object.fromEntries(
      [...response.headers.entries()]
        .filter(([name]) => name.startsWith(META))
        .map(([name, value]) => [name.slice(META.length), value]),
    );
  const fail = (what: string, response: Response) => new Error(`R2 ${what} failed: ${response.status}`);

  return {
    head: async (key: string) => {
      const response = await call("HEAD", key);
      if (response.status === 404) return null;
      if (!response.ok) throw fail("head", response);
      return { key, customMetadata: metadataOf(response) };
    },
    get: async (key: string) => {
      const response = await call("GET", key);
      if (response.status === 404) return null;
      if (!response.ok) throw fail("get", response);
      const type = response.headers.get("content-type");
      return {
        key,
        customMetadata: metadataOf(response),
        httpMetadata: type === null ? undefined : { contentType: type },
        arrayBuffer: () => response.arrayBuffer(),
      };
    },
    put: async (
      key: string,
      value: ArrayBuffer,
      options: { customMetadata?: Record<string, string>; httpMetadata?: { contentType?: string } } = {},
    ) => {
      const meta = Object.fromEntries(
        Object.entries(options.customMetadata ?? {}).map(([name, v]) => [`${META}${name}`, v]),
      );
      const type = options.httpMetadata?.contentType;
      const response = await call(
        "PUT",
        key,
        { ...meta, ...(type === undefined ? {} : { "content-type": type }) },
        value,
      );
      if (!response.ok) throw fail("put", response);
    },
  };
};
