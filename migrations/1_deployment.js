const Voting = artifacts.require("Voting");

module.exports = async function (deployer) {
  await deployer.deploy(Voting);
  // let testInstance = await Voting.deployed();
  // console.log(await testInstance.winningProposalID.call());
};
