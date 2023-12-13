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
        _initialize(_instanceId, Identifiers.POOL_STATE_MANAGMENT_COMPONENT, _poolStorage);
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
        PoolFactory factory = PoolFactory(poolStorage.getAddress(instanceId, "poolFactory"));
        PoolCalculationsComponent pcc = PoolCalculationsComponent(
            factory.componentRegistry(instanceId, Identifiers.POOL_CALCULATIONS_COMPONENT)
        );

        uint256 firstLossAssets = poolStorage.getUint256(instanceId, "firstLossAssets");
        uint256 excessSpread = pcc.borrowerExcessSpread();
        uint256 assetsToSend = firstLossAssets + excessSpread;

        _transitionToFlcWithdrawnStage(assetsToSend);

        IERC20 stableCoinContract = IERC20(poolStorage.getAddress(instanceId, "stableCoinContract"));
        address borrowerAddress = poolStorage.getAddress(instanceId, "borrowerAddress");
        SafeERC20.safeTransfer(stableCoinContract, borrowerAddress, assetsToSend);
    }

    /** @notice Repay principal
     *  can be called only after all interest is paid
     *  can be called only after all penalties are paid
     */
    function borrowerRepayPrincipal() external onlyPoolBorrower atStage(Constants.Stages.BORROWED) whenNotPaused {
        PoolFactory factory = PoolFactory(poolStorage.getAddress(instanceId, "poolFactory"));
        PoolCalculationsComponent pcc = PoolCalculationsComponent(
            factory.componentRegistry(instanceId, Identifiers.POOL_CALCULATIONS_COMPONENT)
        );

        require(pcc.borrowerOutstandingInterest() == 0, "LP203"); // "LendingPool: interest must be paid before repaying principal"
        require(pcc.borrowerPenaltyAmount() == 0, "LP204"); // "LendingPool: penalty must be paid before repaying principal"

        uint256 borrowedAssets = poolStorage.getUint256(instanceId, "borrowedAssets");
        _transitionToPrincipalRepaidStage(borrowedAssets);

        IERC20 stableCoinContract = IERC20(poolStorage.getAddress(instanceId, "stableCoinContract"));
        SafeERC20.safeTransferFrom(stableCoinContract, msg.sender, address(this), borrowedAssets);

        uint256 tranchesCount = poolStorage.getUint256(instanceId, "tranchesCount");
        for (uint i = 0; i < tranchesCount; ++i) {
            address trancheVaultAddress = poolStorage.getArrayAddress(instanceId, "trancheVaultAddresses", i);
            TrancheVault tv = TrancheVault(trancheVaultAddress);
            uint256 tvTotalAssets = tv.totalAssets();
            SafeERC20.safeTransfer(stableCoinContract, address(tv), tvTotalAssets);
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
        uint256 firstLossAssets = poolStorage.getUint256(instanceId, "firstLossAssets");
        _transitionToFlcDepositedStage(firstLossAssets);
        address stableCoinContract = poolStorage.getAddress(instanceId, "stableCoinContract");
        SafeERC20.safeTransferFrom(IERC20(stableCoinContract), msg.sender, address(this), firstLossAssets);
    }

    function borrow() external onlyPoolBorrower atStage(Constants.Stages.FUNDED) whenNotPaused {
        uint256 collectedAssets = poolStorage.getUint256(instanceId, "collectedAssets");
        _transitionToBorrowedStage(collectedAssets);

        address stableCoinContract = poolStorage.getAddress(instanceId, "stableCoinContract");
        address borrowerAddress = poolStorage.getAddress(instanceId, "borrowerAddress");
        SafeERC20.safeTransfer(IERC20(stableCoinContract), borrowerAddress, collectedAssets);
    }

    function _claimTrancheInterestForLender(address lender, uint8 trancheId) internal {
        PoolFactory factory = PoolFactory(poolStorage.getAddress(instanceId, "poolFactory"));
        PoolCalculationsComponent pcc = PoolCalculationsComponent(
            factory.componentRegistry(instanceId, Identifiers.POOL_CALCULATIONS_COMPONENT)
        );
        uint256 rewards = pcc.lenderRewardsByTrancheRedeemable(lender, trancheId);
        if (rewards > 0) {
            Constants.Rewardable memory rewardable = abi.decode(
                poolStorage.getMappingUint256AddressToBytes(instanceId, "s_trancheRewardables", trancheId, lender),
                (Constants.Rewardable)
            );
            rewardable.redeemedRewards += rewards;
            poolStorage.setMappingUint256AddressToBytes(
                instanceId,
                "s_trancheRewardables",
                trancheId,
                lender,
                abi.encode(rewardable)
            );
            PoolTransfersComponent ptc = PoolTransfersComponent(
                factory.componentRegistry(instanceId, Identifiers.POOL_TRANSFERS_COMPONENT)
            );
            ptc.doTransferOut(lender, rewards);
            emit LenderWithdrawInterest(lender, trancheId, rewards);
        }
    }

    function _claimInterestForAllLenders() internal {
        uint256 tranchesCount = poolStorage.getUint256(instanceId, "tranchesCount");
        uint256 lenderCount = poolStorage.getUint256(instanceId, "lenderCount");

        for (uint256 i = 0; i < tranchesCount; i++) {
            address tranche = poolStorage.getArrayAddress(instanceId, "trancheVaultAddresses", i);
            TrancheVault vault = TrancheVault(tranche);
            for (uint j; j < lenderCount; j++) {
                address lender = poolStorage.getArrayAddress(instanceId, "s_lenders", j);
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
        poolStorage.setUint256(instanceId, "defaultedAt", defaultedAt);
        poolStorage.setUint256(instanceId, "currentStage", uint256(Constants.Stages.DEFAULTED));

        _claimInterestForAllLenders();

        // TODO: Update repaid interest to be the total interest paid to lenders
        // TODO: Decide if protocol fees should be paid in event of default
        IERC20 stableCoinContract = IERC20(poolStorage.getAddress(instanceId, "stableCoinContractAddress"));
        uint availableAssets = stableCoinContract.balanceOf(address(this));

        uint256 trancheCount = poolStorage.getUint256(instanceId, "trancheCount");
        for (uint i = 0; i < trancheCount; i++) {
            address trancheVaultAddress = poolStorage.getArrayAddress(instanceId, "trancheVaultAddresses", i);
            TrancheVault tv = TrancheVault(trancheVaultAddress);
            uint256 trancheCoverageWad = poolStorage.getArrayUint256(instanceId, "trancheCoveragesWads", i);
            uint assetsToSend = (trancheCoverageWad * availableAssets) / Constants.WAD;
            uint trancheDefaultRatioWad = (assetsToSend * Constants.WAD) / tv.totalAssets();

            if (assetsToSend > 0) {
                SafeERC20.safeTransfer(stableCoinContract, address(tv), assetsToSend);
            }
            availableAssets -= assetsToSend;
            tv.setDefaultRatioWad(trancheDefaultRatioWad);
            tv.enableWithdrawals();
        }

        emit PoolDefaulted(poolStorage.getUint256(instanceId, "defaultedAt"));
    }

    function adminTransitionToDefaultedState(uint256 _instanceId) external {
        TribalGovernance governance = TribalGovernance(poolStorage.getAddress(instanceId, "governance"));
        require(governance.isAdmin(msg.sender), "not admin");
        uint256 fundedAt = poolStorage.getUint256(_instanceId, "fundedAt");
        uint256 lendingTermSeconds = poolStorage.getUint256(_instanceId, "lendingTermSeconds");
        require(block.timestamp >= fundedAt + lendingTermSeconds, "LP023");

        poolStorage.setUint256(_instanceId, "currentStage", uint256(Constants.Stages.DEFAULTED));
    }

    function _transitionToFundedStage() internal whenNotPaused {
        uint256 fundedAt = block.timestamp;
        poolStorage.setUint256(instanceId, "fundedAt", fundedAt);
        poolStorage.setUint256(instanceId, "currentStage", uint256(Constants.Stages.FUNDED));

        uint256 tranchesCount = poolStorage.getUint256(instanceId, "tranchesCount");

        for (uint i; i < tranchesCount; i++) {
            address tranche = poolStorage.getArrayAddress(instanceId, "trancheVaultAddresses", i);
            TrancheVault vault = TrancheVault(tranche);

            vault.disableDeposits();
            vault.disableWithdrawals();
            vault.sendAssetsToPool(vault.totalAssets());
        }

        uint256 collectedAssets = poolStorage.getUint256(instanceId, "collectedAssets");
        emit PoolFunded(fundedAt, collectedAssets);
    }

    function _transitionToFundingFailedStage() internal whenNotPaused {
        uint256 fundingFailedAt = block.timestamp;

        poolStorage.setUint256(instanceId, "fundingFailedAt", fundingFailedAt);
        poolStorage.setUint256(instanceId, "currentStage", uint256(Constants.Stages.FUNDING_FAILED));

        uint256 tranchesCount = poolStorage.getUint256(instanceId, "tranchesCount");

        for (uint i; i < tranchesCount; i++) {
            address tranche = poolStorage.getArrayAddress(instanceId, "trancheVaultAddresses", i);
            TrancheVault vault = TrancheVault(tranche);
            vault.disableDeposits();
            vault.enableWithdrawals();
        }
        emit PoolFundingFailed(fundingFailedAt);
    }

    function _transitionToFlcDepositedStage(uint flcAssets) internal whenNotPaused {
        uint256 flcDepositedAt = block.timestamp;
        poolStorage.setUint256(instanceId, "flcDepositedAt", flcDepositedAt);
        poolStorage.setUint256(instanceId, "currentStage", uint256(Constants.Stages.FLC_DEPOSITED));

        address borrowerAddress = poolStorage.getAddress(instanceId, "borrowerAddress");
        emit BorrowerDepositFirstLossCapital(borrowerAddress, flcAssets);
    }

    function _transitionToBorrowedStage(uint amountToBorrow) internal whenNotPaused {
        uint256 borrowedAt = block.timestamp;
        poolStorage.setUint256(instanceId, "borrowedAt", borrowedAt);
        poolStorage.setUint256(instanceId, "borrowedAssets", amountToBorrow);
        poolStorage.setUint256(instanceId, "currentStage", uint256(Constants.Stages.BORROWED));
        address borrowerAddress = poolStorage.getAddress(instanceId, "borrowerAddress");

        emit BorrowerBorrow(borrowerAddress, amountToBorrow);
    }

    function _transitionToPrincipalRepaidStage(uint repaidPrincipal) internal whenNotPaused {
        uint256 repaidAt = block.timestamp;
        poolStorage.setUint256(instanceId, "repaidAt", repaidAt);
        poolStorage.setUint256(instanceId, "currentStage", uint256(Constants.Stages.REPAID));
        address borrowerAddress = poolStorage.getAddress(instanceId, "borrowerAddress");
        emit BorrowerRepayPrincipal(borrowerAddress, repaidPrincipal);
        emit PoolRepaid(repaidAt);
    }

    function _transitionToFlcWithdrawnStage(uint flcAssets) internal whenNotPaused {
        uint256 flcWithdrawntAt = block.timestamp;
        poolStorage.setUint256(instanceId, "flcWithdrawntAt", flcWithdrawntAt);
        poolStorage.setUint256(instanceId, "currentStage", uint256(Constants.Stages.FLC_WITHDRAWN));
        address borrowerAddress = poolStorage.getAddress(instanceId, "borrowerAddress");
        emit BorrowerWithdrawFirstLossCapital(borrowerAddress, flcAssets);
    }

    /** @notice Checks whether the pool was funded successfully or not.
     *  this function is expected to be called by *owner* once the funding period ends
     */
    function adminTransitionToFundedState() external atStage(Constants.Stages.OPEN) {
        TribalGovernance governance = TribalGovernance(poolStorage.getAddress(instanceId, "governance"));
        require(governance.isAdmin(msg.sender), "not admin");

        uint256 openedAt = poolStorage.getUint256(instanceId, "openedAt");
        uint256 fundingPeriodSeconds = poolStorage.getUint256(instanceId, "fundingPeriodSeconds");
        require(
            block.timestamp >= openedAt + fundingPeriodSeconds,
            "Cannot accrue interest or declare failure before start time"
        );

        uint256 collectedAssets = poolStorage.getUint256(instanceId, "collectedAssets");
        uint256 minFundingCapacity = poolStorage.getUint256(instanceId, "minFundingCapacity");
        if (collectedAssets >= minFundingCapacity) {
            _transitionToFundedStage();
        } else {
            _transitionToFundingFailedStage();
        }
    }
}
