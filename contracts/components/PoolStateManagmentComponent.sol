// SPDX-License-Identifier: MIT

import "./Component.sol";

import "../vaults/TrancheVault.sol";
import "../storage/PoolStorage.sol";
import "../utils/Constants.sol";
import "../utils/Identifiers.sol";
import "../modifiers/StateControl.sol";
import "../events/PoolEvents.sol";

pragma solidity 0.8.18;

contract PoolStateManagmentComponent is Component, StateControl, PoolEvents {
    
    function initialize(uint256 _instanceId, PoolStorage _poolStorage) public override initializer {
        Component._initialize(_instanceId, Identifiers.POOL_STATE_MANAGMENT_COMPONENT, _poolStorage);
        StateControl._initialize(_poolStorage);
    }

    /** @notice Withdraw first loss capital and excess spread
     *  can be called only after principal is repaid
     */
    function borrowerWithdrawFirstLossCapitalAndExcessSpread()
        external
        onlyPoolBorrower
        atStage(Constants.Stages.REPAID)
        whenNotPaused
    {
        PoolFactory factory = PoolFactory(poolStorage.getAddress("poolFactory"));
        PoolCalculationsComponent pcc = PoolCalculationsComponent(
            factory.componentRegistry(instanceId, Identifiers.POOL_CALCULATIONS_COMPONENT)
        );

        uint256 firstLossAssets = poolStorage.getUint256("firstLossAssets");
        uint256 excessSpread = pcc.borrowerExcessSpread();
        uint256 assetsToSend = firstLossAssets + excessSpread;

        _transitionToFlcWithdrawnStage(assetsToSend);

        address borrowerAddress = poolStorage.getAddress("borrowerAddress");

        PoolTransfersComponent ptc = PoolTransfersComponent(
            factory.componentRegistry(instanceId, Identifiers.POOL_TRANSFERS_COMPONENT)
        );

        ptc.doTransferOutStable(borrowerAddress, assetsToSend);
    }

    /** @notice Repay principal
     *  can be called only after all interest is paid
     *  can be called only after all penalties are paid
     */
    function borrowerRepayPrincipal() external onlyPoolBorrower atStage(Constants.Stages.BORROWED) whenNotPaused {
        PoolFactory factory = PoolFactory(poolStorage.getAddress("poolFactory"));
        PoolCalculationsComponent pcc = PoolCalculationsComponent(
            factory.componentRegistry(instanceId, Identifiers.POOL_CALCULATIONS_COMPONENT)
        );

        require(pcc.borrowerOutstandingInterest() == 0, "LP203"); // "LendingPool: interest must be paid before repaying principal"
        require(pcc.borrowerPenaltyAmount() == 0, "LP204"); // "LendingPool: penalty must be paid before repaying principal"

        uint256 borrowedAssets = poolStorage.getUint256("borrowedAssets");
        _transitionToPrincipalRepaidStage(borrowedAssets);

        PoolTransfersComponent ptc = PoolTransfersComponent(
            factory.componentRegistry(instanceId, Identifiers.POOL_TRANSFERS_COMPONENT)
        );

        ptc.doTrasnferInStable(msg.sender, borrowedAssets);

        uint256 tranchesCount = poolStorage.getUint256("tranchesCount");
        for (uint i = 0; i < tranchesCount; ++i) {
            address trancheVaultAddress = poolStorage.getArrayAddress("trancheVaultAddresses", i);
            TrancheVault tv = TrancheVault(trancheVaultAddress);
            uint256 tvTotalAssets = tv.totalAssets();
            ptc.doTransferOutStable(address(tv), tvTotalAssets);
            // TODO, don't send funds to TV, it should all be in Transfers Component
            tv.enableWithdrawals();
        }
    }

    /** @notice Deposits first loss capital into the pool
     *  should be called by the borrower before the pool can start
     */
    function borrowerDepositFirstLossCapital()
        external
        onlyPoolBorrower
        atStage(Constants.Stages.INITIAL)
        whenNotPaused
    {
        uint256 firstLossAssets = poolStorage.getUint256("firstLossAssets");
        _transitionToFlcDepositedStage(firstLossAssets);
        PoolFactory factory = PoolFactory(poolStorage.getAddress("poolFactory"));
        
        PoolTransfersComponent ptc = PoolTransfersComponent(
            factory.componentRegistry(instanceId, Identifiers.POOL_TRANSFERS_COMPONENT)
        );

        ptc.doTrasnferInStable(msg.sender, firstLossAssets);
    }

    function borrow() external onlyPoolBorrower atStage(Constants.Stages.FUNDED) whenNotPaused {
        uint256 collectedAssets = poolStorage.getUint256("collectedAssets");
        _transitionToBorrowedStage(collectedAssets);
        PoolFactory factory = PoolFactory(poolStorage.getAddress("poolFactory"));

        PoolTransfersComponent ptc = PoolTransfersComponent(
            factory.componentRegistry(instanceId, Identifiers.POOL_TRANSFERS_COMPONENT)
        );
        
        address borrowerAddress = poolStorage.getAddress("borrowerAddress");
        ptc.doTransferOutStable(borrowerAddress, collectedAssets);
    }

    function _claimTrancheInterestForLender(address lender, uint8 trancheId) internal {
        PoolFactory factory = PoolFactory(poolStorage.getAddress("poolFactory"));
        PoolCalculationsComponent pcc = PoolCalculationsComponent(
            factory.componentRegistry(instanceId, Identifiers.POOL_CALCULATIONS_COMPONENT)
        );
        uint256 rewards = pcc.lenderRewardsByTrancheRedeemable(lender, trancheId);
        if (rewards > 0) {
            Constants.Rewardable memory rewardable = abi.decode(
                poolStorage.getMappingUint256AddressToBytes("s_trancheRewardables", trancheId, lender),
                (Constants.Rewardable)
            );
            rewardable.redeemedRewards += rewards;
            poolStorage.setMappingUint256AddressToBytes(
                "s_trancheRewardables",
                trancheId,
                lender,
                abi.encode(rewardable)
            );
            PoolTransfersComponent ptc = PoolTransfersComponent(
                factory.componentRegistry(instanceId, Identifiers.POOL_TRANSFERS_COMPONENT)
            );
            ptc.doTransferOutStable(lender, rewards);
            emit LenderWithdrawInterest(lender, trancheId, rewards);
        }
    }

    function _claimInterestForAllLenders() internal {
        uint256 tranchesCount = poolStorage.getUint256("tranchesCount");
        uint256 lenderCount = poolStorage.getUint256("lenderCount");

        for (uint256 i = 0; i < tranchesCount; i++) {
            address tranche = poolStorage.getArrayAddress("trancheVaultAddresses", i);
            TrancheVault vault = TrancheVault(tranche);
            for (uint j; j < lenderCount; j++) {
                address lender = poolStorage.getArrayAddress("s_lenders", j);
                _claimTrancheInterestForLender(lender, vault.id());
            }
        }
    }

    /**
     * @notice Transitions the pool to the defaulted state and pays out remaining assets to the tranche vaults
     * @dev This function is expected to be called by *owner* after the maturity date has passed and principal has not been repaid
     */
    function _transitionToDefaultedStage() internal whenNotPaused {
        uint256 defaultedAt = block.timestamp;
        poolStorage.setUint256("defaultedAt", defaultedAt);
        poolStorage.setUint256("currentStage", uint256(Constants.Stages.DEFAULTED));

        _claimInterestForAllLenders();

        // TODO: Update repaid interest to be the total interest paid to lenders
        // TODO: Decide if protocol fees should be paid in event of default
        IERC20 stableCoinContract = IERC20(poolStorage.getAddress("stableCoinContractAddress"));
        uint availableAssets = stableCoinContract.balanceOf(address(this));

        PoolFactory factory = PoolFactory(poolStorage.getAddress("poolFactory"));
        PoolTransfersComponent ptc = PoolTransfersComponent(
            factory.componentRegistry(instanceId, Identifiers.POOL_TRANSFERS_COMPONENT)
        );

        uint256 trancheCount = poolStorage.getUint256("trancheCount");
        for (uint i = 0; i < trancheCount; i++) {
            address trancheVaultAddress = poolStorage.getArrayAddress("trancheVaultAddresses", i);
            TrancheVault tv = TrancheVault(trancheVaultAddress);
            uint256 trancheCoverageWad = poolStorage.getArrayUint256("trancheCoveragesWads", i);
            uint assetsToSend = (trancheCoverageWad * availableAssets) / Constants.WAD;
            uint trancheDefaultRatioWad = (assetsToSend * Constants.WAD) / tv.totalAssets();

            if (assetsToSend > 0) {
                SafeERC20.safeTransfer(stableCoinContract, address(tv), assetsToSend);
                ptc.doTransferOutStable(address(tv), assetsToSend);
            }
            availableAssets -= assetsToSend;
            tv.setDefaultRatioWad(trancheDefaultRatioWad);
            tv.enableWithdrawals();
        }

        emit PoolDefaulted(poolStorage.getUint256("defaultedAt"));
    }

    function adminTransitionToDefaultedState() external {
        TribalGovernance governance = TribalGovernance(poolStorage.getAddress("governance"));
        require(governance.isAdmin(msg.sender), "not admin");
        uint256 fundedAt = poolStorage.getUint256("fundedAt");
        uint256 lendingTermSeconds = poolStorage.getUint256("lendingTermSeconds");
        require(block.timestamp >= fundedAt + lendingTermSeconds, "LP023");

        poolStorage.setUint256("currentStage", uint256(Constants.Stages.DEFAULTED));
    }

    function _transitionToFundedStage() internal whenNotPaused {
        uint256 fundedAt = block.timestamp;
        poolStorage.setUint256("fundedAt", fundedAt);
        poolStorage.setUint256("currentStage", uint256(Constants.Stages.FUNDED));

        uint256 tranchesCount = poolStorage.getUint256("tranchesCount");

        for (uint i; i < tranchesCount; i++) {
            address tranche = poolStorage.getArrayAddress("trancheVaultAddresses", i);
            TrancheVault vault = TrancheVault(tranche);

            vault.disableDeposits();
            vault.disableWithdrawals();
            vault.sendAssetsToPool(vault.totalAssets());
        }

        uint256 collectedAssets = poolStorage.getUint256("collectedAssets");
        emit PoolFunded(fundedAt, collectedAssets);
    }

    function _transitionToFundingFailedStage() internal whenNotPaused {
        uint256 fundingFailedAt = block.timestamp;

        poolStorage.setUint256("fundingFailedAt", fundingFailedAt);
        poolStorage.setUint256("currentStage", uint256(Constants.Stages.FUNDING_FAILED));

        uint256 tranchesCount = poolStorage.getUint256("tranchesCount");

        for (uint i; i < tranchesCount; i++) {
            address tranche = poolStorage.getArrayAddress("trancheVaultAddresses", i);
            TrancheVault vault = TrancheVault(tranche);
            vault.disableDeposits();
            vault.enableWithdrawals();
        }
        emit PoolFundingFailed(fundingFailedAt);
    }

    function _transitionToFlcDepositedStage(uint flcAssets) internal whenNotPaused {
        uint256 flcDepositedAt = block.timestamp;
        poolStorage.setUint256("flcDepositedAt", flcDepositedAt);
        poolStorage.setUint256("currentStage", uint256(Constants.Stages.FLC_DEPOSITED));

        address borrowerAddress = poolStorage.getAddress("borrowerAddress");
        emit BorrowerDepositFirstLossCapital(borrowerAddress, flcAssets);
    }

    function _transitionToBorrowedStage(uint amountToBorrow) internal whenNotPaused {
        uint256 borrowedAt = block.timestamp;
        poolStorage.setUint256("borrowedAt", borrowedAt);
        poolStorage.setUint256("borrowedAssets", amountToBorrow);
        poolStorage.setUint256("currentStage", uint256(Constants.Stages.BORROWED));
        address borrowerAddress = poolStorage.getAddress("borrowerAddress");

        emit BorrowerBorrow(borrowerAddress, amountToBorrow);
    }

    function _transitionToPrincipalRepaidStage(uint repaidPrincipal) internal whenNotPaused {
        uint256 repaidAt = block.timestamp;
        poolStorage.setUint256("repaidAt", repaidAt);
        poolStorage.setUint256("currentStage", uint256(Constants.Stages.REPAID));
        address borrowerAddress = poolStorage.getAddress("borrowerAddress");
        emit BorrowerRepayPrincipal(borrowerAddress, repaidPrincipal);
        emit PoolRepaid(repaidAt);
    }

    function _transitionToFlcWithdrawnStage(uint flcAssets) internal whenNotPaused {
        uint256 flcWithdrawntAt = block.timestamp;
        poolStorage.setUint256("flcWithdrawntAt", flcWithdrawntAt);
        poolStorage.setUint256("currentStage", uint256(Constants.Stages.FLC_WITHDRAWN));
        address borrowerAddress = poolStorage.getAddress("borrowerAddress");
        emit BorrowerWithdrawFirstLossCapital(borrowerAddress, flcAssets);
    }

    /** @notice Checks whether the pool was funded successfully or not.
     *  this function is expected to be called by *owner* once the funding period ends
     */
    function adminTransitionToFundedState() external atStage(Constants.Stages.OPEN) {
        TribalGovernance governance = TribalGovernance(poolStorage.getAddress("governance"));
        require(governance.isAdmin(msg.sender), "not admin");

        uint256 openedAt = poolStorage.getUint256("openedAt");
        uint256 fundingPeriodSeconds = poolStorage.getUint256("fundingPeriodSeconds");
        require(
            block.timestamp >= openedAt + fundingPeriodSeconds,
            "Cannot accrue interest or declare failure before start time"
        );

        uint256 collectedAssets = poolStorage.getUint256("collectedAssets");
        uint256 minFundingCapacity = poolStorage.getUint256("minFundingCapacity");
        if (collectedAssets >= minFundingCapacity) {
            _transitionToFundedStage();
        } else {
            _transitionToFundingFailedStage();
        }
    }
}