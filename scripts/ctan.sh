#!/bin/sh
# Copyright 2026 vedoge
#
# This work may be distributed and/or modified under the conditions of the
# LaTeX Project Public License, either version 1.3c of this license or (at
# your option) any later version. The latest version of this license is in
# https://www.latex-project.org/lppl.txt and version 1.3c or later is part
# of all distributions of LaTeX version 2008 or later.
#
# This work has the LPPL maintenance status `maintained'.
# The Current Maintainer of this work is vedoge (https://github.com/vedoge).
#
# This work consists of all the files in https://github.com/vedoge/rpn-typesetter.
#
# Builds rpn-typesetter-ctan.zip, the LuaLaTeX package as CTAN takes an
# upload: one rpn-typesetter/ folder holding the package, its README and its
# documentation, source and PDF. Needs lualatex and zip.
#
#   npm run ctan            (or: sh scripts/ctan.sh [output.zip])
set -eu

root=$(cd "$(dirname "$0")/.." && pwd)
out=${1:-"$root/rpn-typesetter-ctan.zip"}
case $out in /*) ;; *) out="$PWD/$out" ;; esac

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
pkg="$work/rpn-typesetter"
mkdir "$pkg"
cp "$root"/lualatex/README.md "$root"/lualatex/*.sty "$root"/lualatex/*.lua "$root"/lualatex/rpn-typesetter-doc.tex "$pkg/"

# The documentation is typeset with the package itself. Twice, for references.
build="$work/build"
mkdir "$build"
for pass in 1 2; do
  (cd "$pkg" && TEXINPUTS=.//: LUAINPUTS=.//: lualatex -interaction=nonstopmode -halt-on-error \
    -output-directory="$build" rpn-typesetter-doc.tex >/dev/null) || {
    echo "lualatex failed on the documentation (pass $pass):" >&2
    grep -A3 '^!' "$build/rpn-typesetter-doc.log" >&2 || true
    exit 1
  }
done
cp "$build/rpn-typesetter-doc.pdf" "$pkg/"

rm -f "$out"
(cd "$work" && zip -qr "$out" rpn-typesetter)
echo "wrote $out:"
unzip -l "$out"
