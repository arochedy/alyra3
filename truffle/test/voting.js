const Voting = artifacts.require("Voting");

const {BN, expectRevert, expectEvent} = require('@openzeppelin/test-helpers');
const {expect} = require('chai');

contract("Voting", accounts => {

    let VotingInstance;

    const _owner = accounts[0];
    const _voter1 = accounts[1];
    const _voter2 = accounts[2];
    const _unknown = accounts[9];

    const _statusEnum = Voting.WorkflowStatus;

    context("Contract initialization", () => {

        beforeEach(async () => {
            VotingInstance = await Voting.new({from: _owner});
        });

        it("Owner is deployer", async () => {
            const owner = await VotingInstance.owner.call();
            expect(_owner).equals(owner);
        });

        it("Initial workflow status is RegisteringVoters", async () => {
            const status = await VotingInstance.workflowStatus.call();
            expect(status).to.be.bignumber.equal(new BN(_statusEnum.RegisteringVoters));
        });

        it("Proposals list is empty", async () => {
            await VotingInstance.addVoter(_voter1, {from: _owner});
            await expectRevert.unspecified(VotingInstance.getOneProposal.call(0, {from: _voter1}));
        });

        it("Initial winningProposalID is 0", async () => {
            const winningProposalID = await VotingInstance.winningProposalID.call();
            expect(winningProposalID).to.be.bignumber.equal(new BN(0));
        });
    });

    context("Getters", () => {
        
        describe("getVoter", () => {

            beforeEach(async () => {
                VotingInstance = await Voting.new({from: _owner});
                await VotingInstance.addVoter(_voter1, {from: _owner});
            });

            it("Only voter is allowed to get voter", async () => {
                await expectRevert(VotingInstance.getVoter(_voter1, {from: _unknown}), "You're not a voter");
                await expectRevert(VotingInstance.getVoter(_voter1, {from: _owner}), "You're not a voter");
            });

            it("Unregistered voter is retrieved", async () => {
                let voter = await VotingInstance.getVoter.call(_unknown, {from: _voter1});
                expect(voter.isRegistered).equal(false);
            });

            it("Registered voter is retrieved", async () => {
                voter = await VotingInstance.getVoter.call(_voter1, {from: _voter1});
                expect(voter.isRegistered).equal(true);
            });
        });

        describe("getOneProposal", () => {

            it("Only voter is allowed to get proposal", async () => {
                VotingInstance = await Voting.new({from: _owner});
                await VotingInstance.addVoter(_voter1, {from: _owner});
                await VotingInstance.startProposalsRegistering({from: _owner});

                await expectRevert(VotingInstance.getOneProposal.call(0, {from: _unknown}), "You're not a voter");
                await expectRevert(VotingInstance.getOneProposal.call(0, {from: _owner}), "You're not a voter");
            });

            //Get unregistered proposal is tested on 'Contract initialization' part
            //Get registered proposal is tested on 'Operations' > 'Proposal registration' part
        });
    });

    context("Workflow transitions", () => {

        //Test illegal status transitions from status given in argument
        function checkIllegalTransitions(currentStatus) {
            it("Illegal transitions fail", async () => {
                if (currentStatus != _statusEnum.RegisteringVoters) {
                    await expectRevert(VotingInstance.startProposalsRegistering.call({from: _owner}), "Registering proposals cant be started now");
                }
                if (currentStatus != _statusEnum.ProposalsRegistrationStarted) {
                    await expectRevert(VotingInstance.endProposalsRegistering.call({from: _owner}), "Registering proposals havent started yet");
                }
                if (currentStatus != _statusEnum.ProposalsRegistrationEnded) {
                    await expectRevert(VotingInstance.startVotingSession.call({from: _owner}), "Registering proposals phase is not finished");
                }
                if (currentStatus != _statusEnum.VotingSessionStarted) {
                    await expectRevert(VotingInstance.endVotingSession.call({from: _owner}), "Voting session havent started yet");
                }
                if (currentStatus != _statusEnum.VotingSessionEnded) {
                    await expectRevert(VotingInstance.tallyVotes.call({from: _owner}), "Current status is not voting session ended");
                }
            });
        }

        describe("Transition from RegisteringVoters", () => {

            beforeEach(async () => {
                VotingInstance = await Voting.new({from: _owner});
                await VotingInstance.addVoter(_voter1, {from: _owner});
            });

            it("Only owner is allowed to change status", async () => {
                await expectRevert(VotingInstance.startProposalsRegistering.call({from: _unknown}), "Ownable: caller is not the owner");
                await expectRevert(VotingInstance.startProposalsRegistering.call({from: _voter1}), "Ownable: caller is not the owner");
            });

            checkIllegalTransitions(_statusEnum.RegisteringVoters);

            it("Legal transition to ProposalsRegistrationStarted is successful", async () => {
                await expectRevert.unspecified(VotingInstance.getOneProposal.call(0, {from: _voter1}));

                const result = await VotingInstance.startProposalsRegistering({from: _owner});
                expectEvent(result, "WorkflowStatusChange", {previousStatus: new BN(_statusEnum.RegisteringVoters), newStatus: new BN(_statusEnum.ProposalsRegistrationStarted)});

                const status = await VotingInstance.workflowStatus.call();
                expect(status).to.be.bignumber.equal(new BN(_statusEnum.ProposalsRegistrationStarted));

                //Genesis proposal is now created
                const genesisProposal = await VotingInstance.getOneProposal.call(0, {from: _voter1});
                expect(genesisProposal.description).equal("GENESIS");
            });
        });

        describe("Transition from ProposalsRegistrationStarted", () => {

            beforeEach(async () => {
                VotingInstance = await Voting.new({from: _owner});
                await VotingInstance.startProposalsRegistering({from: _owner});
            });

            it("Only owner is allowed to change status", async () => {
                await expectRevert(VotingInstance.endProposalsRegistering.call({from: _unknown}), "Ownable: caller is not the owner");
                await expectRevert(VotingInstance.endProposalsRegistering.call({from: _voter1}), "Ownable: caller is not the owner");
            });

            checkIllegalTransitions(_statusEnum.ProposalsRegistrationStarted);

            it("Legal transition to ProposalsRegistrationEnded is successful", async () => {
                const result = await VotingInstance.endProposalsRegistering({from: _owner});
                expectEvent(result, "WorkflowStatusChange", {previousStatus: new BN(_statusEnum.ProposalsRegistrationStarted), newStatus: new BN(_statusEnum.ProposalsRegistrationEnded)});

                const status = await VotingInstance.workflowStatus.call();
                expect(status).to.be.bignumber.equal(new BN(_statusEnum.ProposalsRegistrationEnded));
            });
        });


        describe("Transition from ProposalsRegistrationEnded", () => {

            beforeEach(async () => {
                VotingInstance = await Voting.new({from: _owner});
                await VotingInstance.addVoter(_voter1, {from: _owner});
                await VotingInstance.startProposalsRegistering({from: _owner});
                await VotingInstance.endProposalsRegistering({from: _owner});
            });

            it("Only owner is allowed to change status", async () => {
                await expectRevert(VotingInstance.startVotingSession.call({from: _unknown}), "Ownable: caller is not the owner");
                await expectRevert(VotingInstance.startVotingSession.call({from: _unknown}), "Ownable: caller is not the owner");
            });

            checkIllegalTransitions(_statusEnum.ProposalsRegistrationEnded);

            it("Legal transition to VotingSessionStarted is successful", async () => {
                const result = await VotingInstance.startVotingSession({from: _owner});
                expectEvent(result, "WorkflowStatusChange", {previousStatus: new BN(_statusEnum.ProposalsRegistrationEnded), newStatus: new BN(_statusEnum.VotingSessionStarted)});

                const status = await VotingInstance.workflowStatus.call();
                expect(status).to.be.bignumber.equal(new BN(_statusEnum.VotingSessionStarted));
            });
        });

        describe("Transition from VotingSessionStarted", () => {

            beforeEach(async () => {
                VotingInstance = await Voting.new({from: _owner});
                await VotingInstance.startProposalsRegistering({from: _owner});
                await VotingInstance.endProposalsRegistering({from: _owner});
                await VotingInstance.startVotingSession({from: _owner});
            });

            it("Only owner is allowed to change status", async () => {
                await expectRevert(VotingInstance.endVotingSession.call({from: _unknown}), "Ownable: caller is not the owner");
                await expectRevert(VotingInstance.endVotingSession.call({from: _voter1}), "Ownable: caller is not the owner");
            });

            checkIllegalTransitions(_statusEnum.VotingSessionStarted);

            it("Legal transition to VotingSessionEnded is successful", async () => {
                const result = await VotingInstance.endVotingSession({from: _owner});
                expectEvent(result, "WorkflowStatusChange", {previousStatus: new BN(_statusEnum.VotingSessionStarted), newStatus: new BN(_statusEnum.VotingSessionEnded)});

                const status = await VotingInstance.workflowStatus.call();
                expect(status).to.be.bignumber.equal(new BN(_statusEnum.VotingSessionEnded));
            });
        });


        describe("Transition from VotingSessionEnded", () => {

            beforeEach(async () => {
                VotingInstance = await Voting.new({from: _owner});
                await VotingInstance.startProposalsRegistering({from: _owner});
                await VotingInstance.endProposalsRegistering({from: _owner});
                await VotingInstance.startVotingSession({from: _owner});
                await VotingInstance.endVotingSession({from: _owner});
            });

            it("Only owner is allowed to change status", async () => {
                await expectRevert(VotingInstance.tallyVotes.call({from: _unknown}), "Ownable: caller is not the owner");
                await expectRevert(VotingInstance.tallyVotes.call({from: _voter1}), "Ownable: caller is not the owner");
            });

            checkIllegalTransitions(_statusEnum.VotingSessionEnded);

            it("Legal transition to VotesTallied is successful", async () => {
                const result = await VotingInstance.tallyVotes({from: _owner});
                expectEvent(result, "WorkflowStatusChange", {previousStatus: new BN(_statusEnum.VotingSessionEnded), newStatus: new BN(_statusEnum.VotesTallied)});

                const status = await VotingInstance.workflowStatus.call();
                expect(status).to.be.bignumber.equal(new BN(_statusEnum.VotesTallied));

            });

            describe("Winner management", () => {

                beforeEach(async () => {
                    VotingInstance = await Voting.new({from: _owner});
                    await VotingInstance.addVoter(_voter1, {from: _owner});
                    await VotingInstance.addVoter(_voter2, {from: _owner});
                    await VotingInstance.startProposalsRegistering({from: _owner});
                });

                it("Genesis proposal wins if no vote", async () => {
                    await VotingInstance.endProposalsRegistering({from: _owner});
                    await VotingInstance.startVotingSession({from: _owner});
                    await VotingInstance.endVotingSession({from: _owner});
                    await VotingInstance.tallyVotes({from: _owner});

                    const winningProposalID = await VotingInstance.winningProposalID.call({from: _unknown});
                    expect(winningProposalID).to.be.bignumber.equal(new BN(0));
                });

                it("High score proposal wins", async () => {
                    await VotingInstance.addProposal("Proposal 1", {from: _voter1});
                    await VotingInstance.addProposal("Proposal 2", {from: _voter2});
                    await VotingInstance.endProposalsRegistering({from: _owner});
                    await VotingInstance.startVotingSession({from: _owner});
                    await VotingInstance.setVote(2, {from: _voter1});
                    await VotingInstance.setVote(2, {from: _voter2});
                    await VotingInstance.endVotingSession({from: _owner});
                    await VotingInstance.tallyVotes({from: _owner});

                    const winningProposalID = await VotingInstance.winningProposalID.call({from: _unknown});
                    expect(winningProposalID).to.be.bignumber.equal(new BN(2));
                });

                it("First voted proposal wins on tie vote", async () => {
                    await VotingInstance.addProposal("Proposal 1", {from: _voter1});
                    await VotingInstance.addProposal("Proposal 2", {from: _voter2});
                    await VotingInstance.endProposalsRegistering({from: _owner});
                    await VotingInstance.startVotingSession({from: _owner});
                    await VotingInstance.setVote(2, {from: _voter1});
                    await VotingInstance.setVote(1, {from: _voter2});
                    await VotingInstance.endVotingSession({from: _owner});
                    await VotingInstance.tallyVotes({from: _owner});

                    const winningProposalID = await VotingInstance.winningProposalID.call({from: _unknown});
                    expect(winningProposalID).to.be.bignumber.equal(new BN(2));
                });
            });
        });

        describe("Transition from VotesTallied", () => {

            beforeEach(async () => {
                VotingInstance = await Voting.new({from: _owner});
                await VotingInstance.startProposalsRegistering({from: _owner});
                await VotingInstance.endProposalsRegistering({from: _owner});
                await VotingInstance.startVotingSession({from: _owner});
                await VotingInstance.endVotingSession({from: _owner});
                await VotingInstance.tallyVotes({from: _owner});
            });

            checkIllegalTransitions(_statusEnum.VotingSessionEnded);
        });
    });

    context("Workflow restrictions on operations", () => {

        beforeEach(async () => {
            VotingInstance = await Voting.new({from: _owner});
        });

        it("Illegal operations on RegisteringVoters status fail", async () => {
            await VotingInstance.addVoter(_voter1, {from: _owner});
            
            await expectRevert(VotingInstance.addProposal("Proposal 1", {from: _voter1}), "Proposals are not allowed yet");

            //setVote should fail, but as we cannot register proposal in RegisteringVoters because any proposal exists, it fails for another reason
            await expectRevert.unspecified(VotingInstance.setVote(0, {from: _voter1}));
        });

        it("Illegal operations on ProposalsRegistrationStarted status fail", async () => {
            await VotingInstance.addVoter(_voter1, {from: _owner});
            await VotingInstance.startProposalsRegistering({from: _owner});
            await VotingInstance.addProposal("Proposal 1", {from: _voter1});

            await expectRevert(VotingInstance.addVoter(_voter2, {from: _owner}), "Voters registration is not open yet");
            await expectRevert(VotingInstance.setVote(1, {from: _voter1}), "Voting session havent started yet.");
        });

        it("Illegal operations on ProposalsRegistrationEnded status fail", async () => {
            await VotingInstance.addVoter(_voter1, {from: _owner});
            await VotingInstance.startProposalsRegistering({from: _owner});
            await VotingInstance.endProposalsRegistering({from: _owner});

            await expectRevert(VotingInstance.addVoter(_voter2, {from: _owner}), "Voters registration is not open yet");
            await expectRevert(VotingInstance.addProposal("Proposal 2", {from: _voter1}), "Proposals are not allowed yet");
            await expectRevert(VotingInstance.setVote(1, {from: _voter1}), "Voting session havent started yet.");
        });

        it("Illegal operations on VotingSessionStarted status fail", async () => {
            await VotingInstance.addVoter(_voter1, {from: _owner});
            await VotingInstance.startProposalsRegistering({from: _owner});
            await VotingInstance.endProposalsRegistering({from: _owner});
            await VotingInstance.startVotingSession({from: _owner});

            await expectRevert(VotingInstance.addVoter(_voter2, {from: _owner}), "Voters registration is not open yet");
            await expectRevert(VotingInstance.addProposal("Proposal 2", {from: _voter1}), "Proposals are not allowed yet");
        });

        it("Illegal operations on VotingSessionEnded status fail", async () => {
            await VotingInstance.addVoter(_voter1, {from: _owner});
            await VotingInstance.startProposalsRegistering({from: _owner});
            await VotingInstance.endProposalsRegistering({from: _owner});
            await VotingInstance.startVotingSession({from: _owner});
            await VotingInstance.endVotingSession({from: _owner});

            await expectRevert(VotingInstance.addVoter(_voter2, {from: _owner}), "Voters registration is not open yet");
            await expectRevert(VotingInstance.addProposal("Proposal 2", {from: _voter1}), "Proposals are not allowed yet");
            await expectRevert(VotingInstance.setVote(1, {from: _voter1}), "Voting session havent started yet.");
        });

        it("Illegal operations on VotesTallied status fail", async () => {
            await VotingInstance.addVoter(_voter1, {from: _owner});
            await VotingInstance.startProposalsRegistering({from: _owner});
            await VotingInstance.endProposalsRegistering({from: _owner});
            await VotingInstance.startVotingSession({from: _owner});
            await VotingInstance.endVotingSession({from: _owner});
            await VotingInstance.tallyVotes({from: _owner});

            await expectRevert(VotingInstance.addVoter(_voter2, {from: _owner}), "Voters registration is not open yet");
            await expectRevert(VotingInstance.addProposal("Proposal 2", {from: _voter1}), "Proposals are not allowed yet");
            await expectRevert(VotingInstance.setVote(1, {from: _voter1}), "Voting session havent started yet");
        });
    });

    context("Operations", () => {

        describe("Voter registration", () => {

            beforeEach(async () => {
                VotingInstance = await Voting.new({from: _owner});
            });

            it("Legal voter registration is successful", async () => {
                const result = await VotingInstance.addVoter(_voter1, {from: _owner});
                await expectEvent(result, "VoterRegistered", {voterAddress: _voter1});

                const voter1 = await VotingInstance.getVoter.call(_voter1, {from: _voter1});
                expect(voter1.isRegistered).true;
                expect(voter1.hasVoted).false;
                expect(voter1.votedProposalId).to.be.bignumber.equal(new BN(0));
            });

            it("Only owner is allowed to register voter", async () => {
                await expectRevert(VotingInstance.addVoter.call(_voter1, {from: _unknown}), "Ownable: caller is not the owner");
                await expectRevert(VotingInstance.addVoter.call(_voter2, {from: _voter1}), "Ownable: caller is not the owner");
            });

            it("Voter double registration is forbiden", async () => {
                await VotingInstance.addVoter(_voter1, {from: _owner});
                await expectRevert(VotingInstance.addVoter.call(_voter1, {from: _owner}), 'Already registered');
            });
        });

        describe("Proposal registration", () => {

            beforeEach(async function () {
                VotingInstance = await Voting.new({from: _owner});
                await VotingInstance.addVoter(_voter1, {from: _owner});
                await VotingInstance.startProposalsRegistering({from: _owner});
            });

            it("Only voter is allowed to register proposal", async () => {
                await expectRevert(VotingInstance.addProposal.call("Proposal 1", {from: _unknown}), "You're not a voter");
                await expectRevert(VotingInstance.addProposal.call("Proposal 1", {from: _owner}), "You're not a voter");
            });

            it("Empty proposal is not allowed", async () => {
                await expectRevert(VotingInstance.addProposal.call("", {from: _voter1}), "Vous ne pouvez pas ne rien proposer");
            });

            it("Legal proposal registeration is successful", async () => {
                const result = await VotingInstance.addProposal("Proposal 1", {from: _voter1});
                await expectEvent(result, "ProposalRegistered", {proposalId: new BN(1)});

                const proposal1 = await VotingInstance.getOneProposal.call(1, {from: _voter1});
                expect(proposal1.description).equal("Proposal 1");
                expect(proposal1.voteCount).to.be.bignumber.equal(new BN(0));
            });

            it("Multiple proposal from same voter is allowed", async () => {
                await VotingInstance.addProposal.call("Proposal 2", {from: _voter1});
            });
        });

        describe("Voting", () => {

            beforeEach(async function () {
                VotingInstance = await Voting.new({from: _owner});
                await VotingInstance.addVoter(_voter1, {from: _owner});
                await VotingInstance.startProposalsRegistering({from: _owner});
                await VotingInstance.addProposal("Proposal 1", {from: _voter1});
                await VotingInstance.endProposalsRegistering({from: _owner});
                await VotingInstance.startVotingSession({from: _owner});
            });

            it("Only voter is allowed to vote", async () => {
                await expectRevert(VotingInstance.setVote.call(1, {from: _unknown}), "You're not a voter");
                await expectRevert(VotingInstance.setVote.call(1, {from: _owner}), "You're not a voter");
            });

            it("Vote fails for proposal doesn't exist", async () => {
                await expectRevert(VotingInstance.setVote.call(999999, {from: _voter1}), "Proposal not found");
            });

            it("Legal vote registration is successful", async () => {
                const voteProposalId = 1;

                const proposal1BeforeVote = await VotingInstance.getOneProposal.call(voteProposalId, {from: _voter1});

                const result = await VotingInstance.setVote(voteProposalId, {from: _voter1});
                await expectEvent(result, "Voted", {voter: _voter1, proposalId: new BN(voteProposalId)});

                const voter1 = await VotingInstance.getVoter.call(_voter1, {from: _voter1});
                expect(voter1.votedProposalId).to.be.bignumber.equal(new BN(voteProposalId));
                expect(voter1.hasVoted).true;

                const proposal1AfterVote = await VotingInstance.getOneProposal.call(voteProposalId, {from: _voter1});
                expect(proposal1AfterVote.voteCount).to.be.bignumber.equal(new BN(proposal1BeforeVote.voteCount).add(new BN(1)));

                const winningProposalID = await VotingInstance.winningProposalID.call({from: _voter1});
                expect(winningProposalID).to.be.bignumber.equal(new BN(1));
            });
            
            it("Multiple vote from same voter is forbiden", async () => {
                await VotingInstance.setVote(1, {from: _voter1});
                await expectRevert(VotingInstance.setVote.call(0, {from: _voter1}), "You have already voted");
            });
        });
    });
});
