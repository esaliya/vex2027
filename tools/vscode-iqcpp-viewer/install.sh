#!/bin/bash
# Packages this folder as a .vsix and installs it into VS Code.
# Run it again after changing extension.js or package.json.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"

code_cli="$(command -v code || true)"
if [ -z "$code_cli" ]; then
  code_cli="/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
fi
[ -x "$code_cli" ] || { echo "error: VS Code command line tool not found" >&2; exit 1; }

name=$(jq -r .name "$here/package.json")
publisher=$(jq -r .publisher "$here/package.json")
version=$(jq -r .version "$here/package.json")
display=$(jq -r .displayName "$here/package.json")
desc=$(jq -r .description "$here/package.json")
engine=$(jq -r .engines.vscode "$here/package.json")

build=$(mktemp -d)
trap 'rm -rf "$build"' EXIT
mkdir -p "$build/extension"
cp "$here/package.json" "$here/extension.js" "$build/extension/"

cat > "$build/[Content_Types].xml" <<'EOF'
<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension=".json" ContentType="application/json"/>
  <Default Extension=".js" ContentType="application/javascript"/>
  <Default Extension=".vsixmanifest" ContentType="text/xml"/>
</Types>
EOF

cat > "$build/extension.vsixmanifest" <<EOF
<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
  <Metadata>
    <Identity Language="en-US" Id="$name" Version="$version" Publisher="$publisher"/>
    <DisplayName>$display</DisplayName>
    <Description xml:space="preserve">$desc</Description>
    <Properties>
      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="$engine"/>
    </Properties>
  </Metadata>
  <Installation>
    <InstallationTarget Id="Microsoft.VisualStudio.Code"/>
  </Installation>
  <Dependencies/>
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/>
  </Assets>
</PackageManifest>
EOF

vsix="$build/$name-$version.vsix"
(cd "$build" && zip -qr "$vsix" "[Content_Types].xml" extension.vsixmanifest extension)
"$code_cli" --install-extension "$vsix" --force
echo "Installed. In VS Code run 'Developer: Reload Window', then open a .iqcpp file."
