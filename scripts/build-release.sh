#!/usr/bin/env bash

set -euo pipefail

fail() {
  echo "build-release: $*" >&2
  exit 1
}

if (( $# != 2 )); then
  echo "usage: $0 <version> <output-directory>" >&2
  exit 2
fi

version=$1
output_argument=$2

[[ $version =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$ ]] ||
  fail "version must be a semantic version tag such as v1.2.3 or v1.2.3-rc.1"

for command in node tar gzip mktemp find; do
  command -v "$command" >/dev/null 2>&1 || fail "required command is unavailable: $command"
done

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
cd -- "$repo_root"
package_version=$(node -p "require('./package.json').version")
base_version=${version#v}
base_version=${base_version%%-*}
base_version=${base_version%%+*}
[[ $base_version == "$package_version" ]] ||
  fail "tag $version does not match package version v$package_version"

dist_dir="$repo_root/dist"
[[ -f $dist_dir/index.html ]] || fail "dist/index.html is missing; run pnpm build first"
[[ -n $(find "$dist_dir" -type f -print -quit) ]] || fail "dist does not contain files"
[[ -z $(find "$dist_dir" -type l -print -quit) ]] || fail "dist must not contain symbolic links"

mkdir -p -- "$output_argument"
output_dir=$(cd -- "$output_argument" && pwd -P)
[[ -z $(find "$output_dir" -mindepth 1 -maxdepth 1 -print -quit) ]] ||
  fail "output directory must be empty: $output_dir"

temp_root=$(cd -- "${TMPDIR:-/tmp}" && pwd -P)
staging=$(mktemp -d "$temp_root/voiceasset-console-release.XXXXXX")
cleanup() {
  case $staging in
    "$temp_root"/voiceasset-console-release.*) rm -rf -- "$staging" ;;
    *) echo "build-release: refusing to clean unexpected path: $staging" >&2 ;;
  esac
}
trap cleanup EXIT

archive="voiceasset-console-$version.tar.gz"
tar --sort=name --mtime='@0' --owner=0 --group=0 --numeric-owner \
  -C "$dist_dir" -cf - . | gzip -n >"$staging/$archive"
mv -- "$staging/$archive" "$output_dir/"

echo "built $archive in $output_dir"
