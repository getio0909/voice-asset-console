#!/usr/bin/env bash

set -euo pipefail

usage() {
  echo "usage: $0 <version> <commit> <release-directory> [--require-sbom] [--require-container]" >&2
}

fail() {
  echo "verify-release: $*" >&2
  exit 1
}

if (( $# < 3 )); then
  usage
  exit 2
fi

version=$1
commit=$2
release_argument=$3
require_sbom=false
require_container=false
shift 3
while (( $# > 0 )); do
  case $1 in
    --require-sbom) require_sbom=true ;;
    --require-container) require_container=true ;;
    *) usage; exit 2 ;;
  esac
  shift
done

[[ $version =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$ ]] ||
  fail "invalid semantic version tag: $version"
[[ $commit =~ ^[0-9A-Fa-f]{7,64}$ ]] || fail "invalid hexadecimal revision: $commit"
[[ -d $release_argument ]] || fail "release directory does not exist: $release_argument"
release_dir=$(cd -- "$release_argument" && pwd -P)
repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)

for command in node tar sha256sum mktemp diff find awk grep tr; do
  command -v "$command" >/dev/null 2>&1 || fail "required command is unavailable: $command"
done

cd -- "$repo_root"
package_version=$(node -p "require('./package.json').version")
base_version=${version#v}
base_version=${base_version%%-*}
base_version=${base_version%%+*}
[[ $base_version == "$package_version" ]] ||
  fail "tag $version does not match package version v$package_version"
[[ -f dist/index.html ]] || fail "dist/index.html is missing; run pnpm build first"

archive_name="voiceasset-console-$version.tar.gz"
license_name=third-party-licenses.json
sbom_name=voiceasset-console-source.spdx.json
container_name="voiceasset-console-$version-linux-amd64-arm64.oci.tar"
expected_names=(SHA256SUMS "$archive_name" "$license_name")
if $require_sbom || [[ -e $release_dir/$sbom_name ]]; then
  expected_names+=("$sbom_name")
fi
if $require_container || [[ -e $release_dir/$container_name ]]; then
  expected_names+=("$container_name")
fi
mapfile -t expected_names < <(printf '%s\n' "${expected_names[@]}" | LC_ALL=C sort)
mapfile -t actual_names < <(
  find "$release_dir" -mindepth 1 -maxdepth 1 -printf '%f\n' | LC_ALL=C sort
)
[[ $(printf '%s\n' "${actual_names[@]}") == $(printf '%s\n' "${expected_names[@]}") ]] ||
  fail "release directory contains missing or unexpected files"

for name in "${actual_names[@]}"; do
  [[ -f $release_dir/$name && ! -L $release_dir/$name ]] ||
    fail "release entry must be a regular, non-symlink file: $name"
done
if $require_sbom; then
  [[ -f $release_dir/$sbom_name ]] || fail "required SPDX SBOM is missing"
fi
if $require_container; then
  [[ -f $release_dir/$container_name ]] || fail "required multi-platform OCI archive is missing"
fi

shopt -s nullglob
artifact_paths=("$release_dir"/*.tar.gz "$release_dir"/*.oci.tar "$release_dir"/*.json)
mapfile -t expected_checksum_names < <(
  for artifact in "${artifact_paths[@]}"; do
    printf './%s\n' "$(basename -- "$artifact")"
  done | LC_ALL=C sort
)
mapfile -t checksum_names < <(
  awk '{name = $2; sub(/^\*/, "", name); print name}' "$release_dir/SHA256SUMS" | LC_ALL=C sort
)
[[ $(printf '%s\n' "${checksum_names[@]}") == $(printf '%s\n' "${expected_checksum_names[@]}") ]] ||
  fail "SHA256SUMS does not cover exactly the release artifacts"
while read -r checksum name extra; do
  [[ -z ${extra:-} && $checksum =~ ^[0-9a-f]{64}$ && $name == \*./* ]] ||
    fail "malformed SHA256SUMS entry"
done <"$release_dir/SHA256SUMS"
(
  cd -- "$release_dir"
  sha256sum -c SHA256SUMS
)

node -e '
  const fs = require("node:fs");
  const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (!value || Array.isArray(value) || typeof value !== "object" || Object.keys(value).length === 0) {
    throw new Error("license inventory must be a non-empty JSON object");
  }
' "$release_dir/$license_name"
if [[ -f $release_dir/$sbom_name ]]; then
  node -e '
    const fs = require("node:fs");
    const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    if (typeof value.spdxVersion !== "string" || !value.spdxVersion.startsWith("SPDX-")) {
      throw new Error("SBOM is not SPDX JSON");
    }
  ' "$release_dir/$sbom_name"
fi
if [[ -f $release_dir/$container_name ]]; then
  node "$repo_root/scripts/verify-oci-image.mjs" "$release_dir/$container_name" \
    voiceasset-console "$version" "$commit"
fi

archive="$release_dir/$archive_name"
temp_root=$(cd -- "${TMPDIR:-/tmp}" && pwd -P)
staging=$(mktemp -d "$temp_root/voiceasset-console-verify.XXXXXX")
listing="$staging/archive.list"
extracted="$staging/extracted"
cleanup() {
  case $staging in
    "$temp_root"/voiceasset-console-verify.*) rm -rf -- "$staging" ;;
    *) echo "verify-release: refusing to clean unexpected path: $staging" >&2 ;;
  esac
}
trap cleanup EXIT

tar -tzf "$archive" >"$listing"
[[ -s $listing ]] || fail "archive is empty: $archive_name"
while IFS= read -r entry; do
  [[ $entry == . || $entry == ./ || $entry == ./* ]] || fail "unsafe archive root: $entry"
  relative=${entry#./}
  [[ $relative != /* && ! $relative =~ (^|/)\.\.(/|$) ]] || fail "unsafe archive path: $entry"
done <"$listing"

mkdir -p -- "$extracted"
tar -xzf "$archive" -C "$extracted"
[[ -z $(find "$extracted" -type l -print -quit) ]] || fail "archive contains a symbolic link"
diff --brief --recursive "$repo_root/dist" "$extracted" >/dev/null ||
  fail "archive contents differ from the validated dist directory"
[[ -n $(find "$extracted/assets" -type f -print -quit) ]] || fail "archive assets are missing"

contract_version=$(tr -d '[:space:]' <"$repo_root/CONTRACT_VERSION")
grep -R -Fq --include='*.js' -- "$contract_version" "$extracted/assets" ||
  fail "compiled bundle does not contain contract $contract_version"

echo "verified deterministic Console bundle, license inventory, and SHA-256 checksums"
