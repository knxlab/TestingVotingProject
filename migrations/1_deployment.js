const SimpleStorage = artifacts.require("SimpleStorage");

module.exports = async function (deployer) {
  await deployer.deploy(SimpleStorage, 123, { from: "0xbc5A3940775374568227884b5Cb1F50d4823212E", value: "10202" });
  let testInstance = await SimpleStorage.deployed();
  console.log(await testInstance.get());
};
