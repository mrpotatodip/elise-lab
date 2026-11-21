#!/bin/sh
set -eu

repo="mrpotatodip/ts-mrpotato-lab"
tag_prefix="elise-runner-v"
dir="${ELISE_RUNNER_INSTALL_DIR:-$HOME/.local/bin}"

fail() {
  echo "elise-runner install: $*" >&2
  exit 1
}

case "$(uname -s)" in
  Darwin) os=darwin ;;
  Linux) os=linux ;;
  *) fail "unsupported system $(uname -s). The Runner supports macOS and Linux (arm64 and x64)." ;;
esac

case "$(uname -m)" in
  arm64 | aarch64) arch=arm64 ;;
  x86_64 | amd64) arch=x64 ;;
  *) fail "unsupported CPU $(uname -m). The Runner supports arm64 and x64." ;;
esac

asset="elise-runner-$os-$arch"
command -v curl >/dev/null 2>&1 || fail "curl is required."

tag="${ELISE_RUNNER_VERSION:-}"
if [ -z "$tag" ]; then
  releases=$(curl -fsSL "https://api.github.com/repos/$repo/releases?per_page=100") ||
    fail "could not list releases from the GitHub API (a rate limit, HTTP 403, or no network). Wait a few minutes and run this again, or skip the lookup: ELISE_RUNNER_VERSION=${tag_prefix}X.Y.Z (a tag from https://github.com/$repo/releases) sh install.sh"
  tag=$(printf '%s\n' "$releases" | awk -v prefix="$tag_prefix" '
    /"tag_name":/ { split($0, parts, "\""); candidate = parts[4]; draft = ""; next }
    /"draft":/ { draft = ($0 ~ /true/) ? "yes" : "no"; next }
    /"prerelease":/ {
      if (draft == "no" && $0 ~ /false/ && index(candidate, prefix) == 1) { print candidate; exit }
    }') || true
  [ -n "$tag" ] || fail "no published $tag_prefix* release found at https://github.com/$repo/releases"
fi

url="https://github.com/$repo/releases/download/$tag/$asset"
mkdir -p "$dir" || fail "cannot create $dir. Set ELISE_RUNNER_INSTALL_DIR to a folder you can write to."
tmp=$(mktemp "$dir/.elise-runner.XXXXXX") || fail "cannot write to $dir."
trap 'rm -f "$tmp"' EXIT

echo "Downloading $asset from release $tag"
curl -fSL --progress-bar -o "$tmp" "$url" || fail "download failed: $url"
chmod 755 "$tmp"
mv -f "$tmp" "$dir/elise-runner"
trap - EXIT

echo "Installed elise-runner ($tag) to $dir/elise-runner"
case ":$PATH:" in
  *":$dir:"*) ;;
  *) echo "Warning: $dir is not on your PATH. Add it, for example: export PATH=\"$dir:\$PATH\"" ;;
esac
echo "Next, run: elise-runner login"
