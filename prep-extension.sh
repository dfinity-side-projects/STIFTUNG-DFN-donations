cp app/javascripts/background.js build
cp manifest.json build
cd build
zip -r ../fdc-chrome-extension.zip *

