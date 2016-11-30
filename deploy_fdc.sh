echo "Deploying new FDC..."
truffle test test/init/fdc.js | tee /dev/tty | grep "New FDC addr" | egrep -o "0[xX][0-9a-fA-F]+" | awk '{print "var FDC_CONTRACT_ADDRESS = \""$0"\";"}' > app/javascripts/fdc_test_addr.js
echo "OK"
