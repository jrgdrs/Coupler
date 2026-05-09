# Assemble src/ modules → ui.html (skipped if build.js / node not available)
if command -v node >/dev/null 2>&1 && [ -f build.js ]; then
  node build.js
fi

cp -f glyphs/Coupler.glyphsPlugin/Contents/Resources/ui.html docs/index.html
cp -f glyphs/Coupler.glyphsPlugin/Contents/Resources/ui.html glyphs/index.html
cp -f glyphs/Coupler.glyphsPlugin/Contents/Resources/fuchs.js docs/fuchs.js

zip -vr docs/Coupler.zip glyphs/ -x "*.DS_Store"

cp -r ~/github/Coupler/Coupler/glyphs/Coupler.glyphsPlugin ~/Library/Application\ Support/Glyphs\ 3/Plugins/

ls -als ~/Library/Application\ Support/Glyphs\ 3/Plugins/Coupler.glyphsPlugin/Contents/Resources
