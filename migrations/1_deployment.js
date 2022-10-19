const SimpleStorage = artifacts.require("SimpleStorage");

module.exports = async function (deployer) {
  deployer.deploy(SimpleStorage, 1230);
  let testInstance = await SimpleStorage.deployed();
  console.log(await testInstance.get());
};
