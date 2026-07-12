#!/bin/sh

set -eu

repository="${TWO_N_REPOSITORY:-plannotator/2n}"
version="${TWO_N_VERSION:-latest}"
install_dir="${TWO_N_INSTALL_DIR:-$HOME/.local/bin}"

case "$(uname -s)" in
  Darwin) platform="darwin" ;;
  Linux) platform="linux" ;;
  *)
    echo "2n does not provide a release for $(uname -s)." >&2
    exit 1
    ;;
esac

case "$(uname -m)" in
  arm64 | aarch64) architecture="arm64" ;;
  x86_64 | amd64) architecture="x64" ;;
  *)
    echo "2n does not provide a release for CPU $(uname -m)." >&2
    exit 1
    ;;
esac

libc=""
if [ "$platform" = "linux" ]; then
  if { command -v ldd >/dev/null 2>&1 && ldd --version 2>&1 | grep -qi musl; } ||
    [ -e "/lib/ld-musl-${architecture}.so.1" ] ||
    [ -e "/lib/ld-musl-x86_64.so.1" ] ||
    [ -e "/lib/ld-musl-aarch64.so.1" ]; then
    libc="-musl"
  fi
fi

asset="2n-${platform}-${architecture}${libc}"
archive="${asset}.tar.gz"
if [ "$version" = "latest" ]; then
  release_url="https://github.com/${repository}/releases/latest/download"
else
  case "$version" in
    v*) tag="$version" ;;
    *) tag="v$version" ;;
  esac
  release_url="https://github.com/${repository}/releases/download/${tag}"
fi

temporary_dir="$(mktemp -d)"
trap 'rm -rf "$temporary_dir"' EXIT INT TERM

download() {
  source_url="$1"
  destination="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$source_url" -o "$destination"
  elif command -v wget >/dev/null 2>&1; then
    wget -q "$source_url" -O "$destination"
  else
    echo "Install curl or wget, then run this installer again." >&2
    exit 1
  fi
}

download "$release_url/$archive" "$temporary_dir/$archive"
download "$release_url/checksums.txt" "$temporary_dir/checksums.txt"

expected_checksum="$(awk -v name="$archive" '$2 == name { print $1 }' "$temporary_dir/checksums.txt")"
if [ -z "$expected_checksum" ]; then
  echo "The release checksum for $archive is missing." >&2
  exit 1
fi

if command -v sha256sum >/dev/null 2>&1; then
  actual_checksum="$(sha256sum "$temporary_dir/$archive" | awk '{ print $1 }')"
else
  actual_checksum="$(shasum -a 256 "$temporary_dir/$archive" | awk '{ print $1 }')"
fi

if [ "$expected_checksum" != "$actual_checksum" ]; then
  echo "The downloaded $archive failed checksum verification." >&2
  exit 1
fi

tar -xzf "$temporary_dir/$archive" -C "$temporary_dir"
mkdir -p "$install_dir"
install -m 755 "$temporary_dir/$asset" "$install_dir/2n"
install -m 644 "$temporary_dir/LICENSE.md" "$install_dir/2n.LICENSE.md"

echo "Installed 2n to $install_dir/2n"
case ":$PATH:" in
  *":$install_dir:"*) ;;
  *) echo "Add $install_dir to PATH, then run: 2n" ;;
esac
