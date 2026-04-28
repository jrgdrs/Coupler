cp -f glyphs/Coupler.glyphsPlugin/Contents/Resources/ui.html docs/index.html
cp -f glyphs/Coupler.glyphsPlugin/Contents/Resources/ui.html glyphs/index.html
cp -f glyphs/Coupler.glyphsPlugin/Contents/Resources/fuchs.js docs/fuchs.js

zip -vr docs/Coupler.zip glyphs/ -x "*.DS_Store"