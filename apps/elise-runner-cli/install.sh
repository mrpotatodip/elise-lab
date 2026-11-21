#!/bin/sh
# Installs the headless Runner (`elise-runner`) from the newest elise-runner-v* GitHub Release.
#   curl -fsSL https://raw.githubusercontent.com/mrpotatodip/ts-mrpotato-lab/main/apps/elise-runner-cli/install.sh | sh
# ELISE_RUNNER_INSTALL_DIR changes where it goes (default: ~/.local/bin). No sudo.
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

# Newest release whose tag starts with the Runner prefix; the API lists newest first.
releases=$(curl -fsSL "https://api.github.com/repos/$repo/releases?per_page=100") ||
  fail "could not list releases at https://github.com/$repo/releases"
tag=$(printf '%s\n' "$releases" |
  sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' |
  grep "^$tag_prefix" | head -n 1) || true
[ -n "$tag" ] || fail "no $tag_prefix* release found at https://github.com/$repo/releases"

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
