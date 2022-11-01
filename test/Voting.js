const {
  BN,           // Big Number support
  constants,    // Common constants, like the zero address and largest integers
  expectEvent,  // Assertions for emitted events
  expectRevert, // Assertions for transactions that should fail
} = require('@openzeppelin/test-helpers');

const { expect } = require("chai");

const Voting = artifacts.require("./Voting.sol");

const createProposalDesc = num => `Test proposal ${num}`;

async function createVotingInstance(owner) {
  return await Voting.new({from: owner});
}

async function createVotingInstanceWithVoters(owner, voters) {
  const votingInstance = await Voting.new({from: owner});
  for (let index = 0; index < voters.length; index++) {
    const voter = voters[index];
    await votingInstance.addVoter(voter, { from: owner });
  }
  await votingInstance.startProposalsRegistering({ from: owner })
  return votingInstance;
}

async function createVotingInstanceWithVotersAndOneProposalEach(owner, voters) {
  const votingInstance = await createVotingInstanceWithVoters(owner, voters);
  for (let index = 0; index < voters.length; index++) {
    await votingInstance.addProposal(createProposalDesc(index+1), { from: voters[index] });
  }
  await votingInstance.endProposalsRegistering({ from: owner })
  await votingInstance.startVotingSession({ from: owner })

  return votingInstance;
}

async function createVotingInstanceWithWinner(owner, voters, _winnerId) {
  const votingInstance = await createVotingInstanceWithVotersAndOneProposalEach(owner, voters)

  for (let index = 0; index < voters.length; index++) {
    await votingInstance.setVote(_winnerId, { from: voters[index] });
  }

  await votingInstance.endVotingSession({ from: owner });
  await votingInstance.tallyVotes({ from: owner });

  return votingInstance;
}

async function createVotingInstanceEndedWithNoVotes(owner, voters) {
  const votingInstance = await createVotingInstanceWithVotersAndOneProposalEach(owner, voters);

  await votingInstance.endVotingSession({ from: owner });
  await votingInstance.tallyVotes({ from: owner });

  return votingInstance;
}
async function createVotingInstanceEndedWithDraw(owner, voters) {
  const votingInstance = await createVotingInstanceWithVotersAndOneProposalEach(owner, voters);

  await votingInstance.setVote(1, { from: voters[0] });
  await votingInstance.setVote(2, { from: voters[1] });

  await votingInstance.endVotingSession({ from: owner });
  await votingInstance.tallyVotes({ from: owner });

  return votingInstance;
}


contract("Voting", accounts => {

  const _owner = accounts[0];
  const _voters = accounts.filter((a, i) => i !== 0);

  let votingInstance;

  before(async () => {
    votingInstance = await createVotingInstance(_owner);
  });


  const cannotUseStartProposalsRegistering = (from) => async () => {
    await expectRevert(
      votingInstance.startProposalsRegistering({ from }),
      'Registering proposals cant be started now',
    );
  }
  const cannotUseEndProposalsRegistering = (from) => async () => {
    await expectRevert(
      votingInstance.endProposalsRegistering({ from }),
      'Registering proposals havent started yet',
    );
  }
  const cannotStartVotingSession = (from) => async () => {
    await expectRevert(
      votingInstance.startVotingSession({ from }),
      'Registering proposals phase is not finished',
    );
  }
  const cannotEndVotingSession = (from) => async () => {
    await expectRevert(
      votingInstance.endVotingSession({ from }),
      'Voting session havent started yet',
    );
  }
  const cannotTallyVotes = (from) => async () => {
    await expectRevert(
      votingInstance.tallyVotes({ from }),
      'Current status is not voting session ended',
    );
  }

  describe("Check no one but voters can access to", () => {
    [
      { method: 'getVoter', args: [_owner] },
      { method: 'getOneProposal', args: [1] },
      { method: 'addProposal', args: ["test"] },
      { method: 'setVote', args: [1] },
    ].forEach(({ method, args }) => {
      it(`...${method}`, () => expectRevert(
        votingInstance[method](...args, { from: _owner }),
        "You're not a voter"
      ));
    });
  });

  describe("Check no one but owner can access to", () => {
    [
      { method: 'addVoter', args: [_owner] },
      { method: 'startProposalsRegistering' },
      { method: 'endProposalsRegistering' },
      { method: 'startVotingSession' },
      { method: 'endVotingSession' },
      { method: 'tallyVotes' },
    ].forEach(({ method, args }) => {
      it(`...${method}`, () => expectRevert(
        votingInstance[method](...(args || []), { from: _voters[0] }),
        "caller is not the owner"
      ));
    });
  });

  describe("When Voting Status is RegisteringVoters", () => {

    it("...owner cannot end proposal", cannotUseEndProposalsRegistering(_owner));
    it("...owner cannot start voting session", cannotStartVotingSession(_owner));
    it("...owner cannot end voting session", cannotEndVotingSession(_owner));
    it("...owner cannot tally votes", cannotTallyVotes(_owner));

    it("...owner can add a new voter.", async () => {
      expectEvent(
        await votingInstance.addVoter(_voters[0], { from: _owner }),
        'VoterRegistered',
        { voterAddress: _voters[0] }
      );
    });

    it("...owner cannot add a voter already added.", () => expectRevert(
      votingInstance.addVoter(_voters[0], { from: _owner }),
      'Already registered',
    ));

    it("...voter cannot add a proposal.", () => expectRevert(
      votingInstance.addProposal(createProposalDesc(1), { from: _voters[0] }),
      'Proposals are not allowed yet',
    ));

    it("...voter cannot vote.", () => expectRevert(
      votingInstance.setVote(1, { from: _voters[0] }),
      'Voting session havent started yet',
    ));

    it("...voter can get a voter", async () => {
      const voter = await votingInstance.getVoter(_voters[0], { from: _voters[0] });
      expect(voter.isRegistered).to.be.true;
      expect(voter.hasVoted).to.be.false;
      expect(voter.votedProposalId).to.be.bignumber.equal(new BN(0));
    });

    it("...owner can change status to ProposalsRegistrationStarted.", async () => {
      expectEvent(
        await votingInstance.startProposalsRegistering({ from: _owner }),
        'WorkflowStatusChange',
        {
          previousStatus: Voting.WorkflowStatus.RegisteringVoters.toString(),
          newStatus: Voting.WorkflowStatus.ProposalsRegistrationStarted.toString()
        }
      );
    });
  })


  describe("When Voting Status is ProposalsRegistrationStarted", () => {

    before(async () => {
      votingInstance = await createVotingInstanceWithVoters(_owner, _voters);
    });

    it("...owner cannot start proposal registering", cannotUseStartProposalsRegistering(_owner));
    it("...owner cannot start voting session", cannotStartVotingSession(_owner));
    it("...owner cannot end voting session", cannotEndVotingSession(_owner));
    it("...owner cannot tally votes", cannotTallyVotes(_owner));

    it("...owner cannot add voter anymore", () => expectRevert(
      votingInstance.addVoter(_owner, { from: _owner }),
      'Voters registration is not open yet',
    ));

    it("...voter cannot add an empty proposal", () => expectRevert(
      votingInstance.addProposal("", { from: _voters[0] }),
      'Vous ne pouvez pas ne rien proposer',
    ));

    let testProposalDesc = `Test proposal 1`;
    it("...voter can add a proposal.", async () => {
      expectEvent(
        await votingInstance.addProposal(testProposalDesc, { from: _voters[0] }),
        'ProposalRegistered',
        { proposalId: new BN(1) }
      );
    });
    it("...voter can get a proposal", async () => {
      const proposal = await votingInstance.getOneProposal(1, { from: _voters[0] });
      expect(proposal.description).to.be.string(testProposalDesc);
      expect(proposal.voteCount).to.be.bignumber.equal(new BN(0));
    });

    it("...voter cannot vote.", () => expectRevert(
      votingInstance.setVote(1, { from: _voters[0] }),
      'Voting session havent started yet',
    ));

    it("...owner can change status to ProposalsRegistrationEnded.", async () => {
      expectEvent(
        await votingInstance.endProposalsRegistering({ from: _owner }),
        'WorkflowStatusChange',
        {
          previousStatus: Voting.WorkflowStatus.ProposalsRegistrationStarted.toString(),
          newStatus: Voting.WorkflowStatus.ProposalsRegistrationEnded.toString()
        }
      );
    });

    it("...voter cannot add a proposal anymore.", async () => {
      await expectRevert(
        votingInstance.addProposal("new proposal", { from: _voters[0] }),
        'Proposals are not allowed yet',
      );
    });

    it("...owner can change status to VotingSessionStarted.", async () => {
      expectEvent(
        await votingInstance.startVotingSession({ from: _owner }),
        'WorkflowStatusChange',
        {
          previousStatus: Voting.WorkflowStatus.ProposalsRegistrationEnded.toString(),
          newStatus: Voting.WorkflowStatus.VotingSessionStarted.toString()
        }
      );
    });
  })

  describe("When Voting Status is VotingSessionStarted", () => {

    before(async () => {
      votingInstance = await createVotingInstanceWithVotersAndOneProposalEach(_owner, _voters);
    });

    it("...owner cannot start proposal registering", cannotUseStartProposalsRegistering(_owner));
    it("...owner cannot end proposal", cannotUseEndProposalsRegistering(_owner));
    it("...owner cannot start voting session", cannotStartVotingSession(_owner));
    it("...owner cannot tally votes", cannotTallyVotes(_owner));

    it("...voter cannot vote for a proposal id that doesnt exists.", async () => {
      await expectRevert(
        votingInstance.setVote(1200, { from: _voters[0] }),
        'Proposal not found',
      );
    });

    it("...voter can vote for a proposal.", async () => {
      expectEvent(
        await votingInstance.setVote(1, { from: _voters[0] }),
        'Voted',
        { voter: _voters[0],  proposalId: new BN(1) }
      );
    });
    it("...voter cannot vote twice.", () => expectRevert(
      votingInstance.setVote(1, { from: _voters[0] }),
      'You have already voted',
    ));
    it("...voter should have his votedProposalId saved", async () => {
      const voter = await votingInstance.getVoter(_voters[0], { from: _voters[0] });
      expect(voter.votedProposalId).to.be.bignumber.equal(new BN(1));
    });
    it("...first proposal should have one vote", async () => {
      const proposal = await votingInstance.getOneProposal(1, { from: _voters[0] });
      expect(proposal.voteCount).to.be.bignumber.equal(new BN(1));
    });
    it("...first proposal should have 2 votes when voted by an another voter", async () => {
      await votingInstance.setVote(1, { from: _voters[1] });
      const proposal = await votingInstance.getOneProposal(1, { from: _voters[0] });
      expect(proposal.voteCount).to.be.bignumber.equal(new BN(2));
    });


    it("...owner can change status to VotingSessionEnded.", async () => {
      expectEvent(
        await votingInstance.endVotingSession({ from: _owner }),
        'WorkflowStatusChange',
        {
          previousStatus: Voting.WorkflowStatus.VotingSessionStarted.toString(),
          newStatus: Voting.WorkflowStatus.VotingSessionEnded.toString()
        }
      );
    });

    it("...voter cannot vote anymore.", () => expectRevert(
      votingInstance.setVote(1, { from: _voters[2] }),
      'Voting session havent started yet',
    ));

    it("...owner can tallyVotes and change status to VotesTallied.", async () => {
      expectEvent(
        await votingInstance.tallyVotes({ from: _owner }),
        'WorkflowStatusChange',
        {
          previousStatus: Voting.WorkflowStatus.VotingSessionEnded.toString(),
          newStatus: Voting.WorkflowStatus.VotesTallied.toString()
        }
      );
    });

    it("...owner cannot tally votes again", cannotTallyVotes(_owner));
  });


  describe("When Voting has ended and proposal 1 should be the winner", () => {
    let _winnerId = 1;
    before(async () => {
      votingInstance = await createVotingInstanceWithWinner(_owner, _voters, _winnerId);
    });

    it("...winningProposalID should be 1", async () => {
      const winningProposalID = await votingInstance.winningProposalID.call();
      expect(winningProposalID).to.be.bignumber.equal(new BN(1));
    });

  });

  describe("When Voting has ended and no one has voted", () => {
    before(async () => {
      votingInstance = await createVotingInstanceEndedWithNoVotes(_owner, _voters);
    });

    it("...winningProposalID should be 0", async () => {
      const winningProposalID = await votingInstance.winningProposalID.call();
      expect(winningProposalID).to.be.bignumber.equal(new BN(0));
    });

  });

  describe("When Voting has ended and draw", () => {
    before(async () => {
      votingInstance = await createVotingInstanceEndedWithDraw(_owner, _voters);
    });

    it("...winningProposalID should not be 0", async () => {
      const winningProposalID = await votingInstance.winningProposalID.call();
      expect(winningProposalID).to.be.bignumber.not.equal(new BN(0));
    });

  });


});