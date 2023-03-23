// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.18;

/** @dev Lending pool interface.
 *
 * Some terms:
 * WAD: precise integer representation of floating point number precise to 18 decimal points.
 *      For example, 13.37% = 0.1337 * 10**18 == 2 * 10**17 == 133 700 000 000 000 000
 */
interface ILendingPool {
    /*///////////////////////////////////
       State / Initialization events
    ///////////////////////////////////*/

    // Capacities //

    /// @dev The maximum amount of capital that can be deposited into the lending pool.
    event SetMaxFundingCapacity(
        address indexed actor,
        uint oldVal,
        uint newVal
    );

    /// @dev The minimum amount of capital required to fund the lending pool.
    event SetMinFundingCapacity(
        address indexed actor,
        uint oldVal,
        uint newVal
    );

    // Addresses //

    event SetBorrowerAdddress(
        address indexed actor,
        address oldVal,
        address newVal
    );

    /// @dev Stable coin (deposit token) address: coming from the protocol configuration
    event SetStableCoinContractAddress(
        address indexed actor,
        address oldVal,
        address newVal
    );

    event SetFeeSharingContractAdddress(
        address indexed actor,
        address oldVal,
        address newVal
    );

    // Dates and durations (in unix time / seconds) //
    event SetOpenedAt(address indexed actor, uint64 oldVal, uint64 newVal);

    event SetMinFundingCapacityReachedAt(
        address indexed actor,
        uint64 oldVal,
        uint64 newVal
    );

    event SetMaxFundingCapacityReachedAt(
        address indexed actor,
        uint64 oldVal,
        uint64 newVal
    );

    event SetFundedAt(address indexed actor, uint64 oldVal, uint64 newVal);

    event SetFundingFailedAt(
        address indexed actor,
        uint64 oldVal,
        uint64 newVal
    );

    event SetRepaidAt(address indexed actor, uint64 oldVal, uint64 newVal);

    event SetDefaultedAt(address indexed actor, uint64 oldVal, uint64 newVal);

    /// @dev The period of time during which lenders are allowed to deposit capital into the pool.
    event SetFundingPeriod(address indexed actor, uint64 fundingPeriod);

    /// @dev The period of time during which lenders are restricted from withdrawing their funds (measured in seconds)
    event SetLendingTerm(address indexed actor, uint64 lendingTerm);

    /// @dev when 1, is unitranche, when 2 is multitranche
    event SetTranchesCount(address indexed actor, uint8 oldVal, uint8 newVal);

    /** @dev each tranche is a separate vault address:
     *   id: 0 - first loss capital, 1 - junior/default tranche, 2 - senior tranche
     */
    event SetTrancheVaultAddresses(
        address indexed actor,
        uint8 indexed trancheId,
        address[] oldVal,
        address[] newVal
    );

    event SetTrancheMinFundingCapacities(
        address indexed actor,
        uint[] oldVal,
        uint[] newVal
    );
    event SetTrancheMaxFundingCapacities(
        address indexed actor,
        uint[] oldVal,
        uint[] newVal
    );

    /// @dev WAD
    event SetTrancheAPYs(address indexed actor, uint[] oldVal, uint[] newVal);

    /// @dev WAD
    event SetTrancheBoostedAPYs(
        address indexed actor,
        uint[] oldVal,
        uint[] newVal
    );

    /** @dev WAD. The percentage of first-loss capital used as coverage in the event of missed payments or default
     *  (e.g. assumption that first loss capital will be less than the senior tranche)
     */
    event SetTrancheCoverages(
        address indexed actor,
        uint[] oldVal,
        uint[] newVal
    );

    // Borrower //

    /// @dev WAD. Collateral ratio aka FLC/maxFunding. WAD.
    event SetCollateralRatio(
        address indexed actor,
        uint256 oldVal,
        uint256 newVal
    );

    event SetFirstLossCapitalAmount(
        address indexed actor,
        uint256 oldVal,
        uint256 newVal
    );

    event SetBorrowerTotalInterestRate(
        address indexed actor,
        uint256 oldValue,
        uint256 newValue
    );

    /// @dev The penalty that will be applied to borrowers in the event of a default. (ex: Total Penalty = First loss capital + penalty rate * unrepaid capital)
    event SetDefaultPenalty(
        address indexed actor,
        uint256 oldVal,
        uint256 newVal
    );

    /// @dev WAD. The rate at which borrowers will be penalized for late or missed payments.
    event SetPenaltyRate(address indexed actor, uint256 oldVal, uint256 newVal);

    /*///////////////////////////////////
       Action events
    ///////////////////////////////////*/

    // State events //
    event PoolOpen();
    event PoolFunded();
    event PoolFundingFailed();
    event PoolRepaid();
    event PoolDefaulted();

    // Lender events //
    event LenderDeposit(
        address indexed lender,
        uint indexed trancheId,
        uint256 amount
    );

    event LenderWithdraw(
        address indexed lender,
        uint indexed trancheId,
        uint256 amount
    );

    event LenderWithdrawYield(address indexed lender, uint256 amount);

    event LenderBoostAPY(
        address indexed lender,
        uint indexed trancheId,
        uint boostedAPY
    );

    // Borrower events //
    event BorrowerDepositFirstLossCapital(
        address indexed borrower,
        uint amount
    );

    event BorrowerBorrow(address indexed borrower, uint amount);

    event BorrowerPayInterest(address indexed borrower, uint amount);
    event BorrowerPayPenalty(address indexed borrower, uint amount);
    event BorrowerRepayPrincipal(address indexed borrower, uint amount);
    event BorrowerWithdrawFirstLossCapital(
        address indexed borrower,
        uint amount
    );

    /*///////////////////////////////////
       Init functions
    ///////////////////////////////////*/

    struct LendingPoolParams {
        string name;
        string token;
        address stableCoinContractAddress;
        uint minFundingCapacity;
        uint maxFundingCapacity;
        int64 fundingPeriodSeconds;
        int64 lendingTermSeconds;
        address borrowerAddress;
        uint borrowerTotalInterestRateWad;
        uint collateralRatioWad;
        uint defaultPenalty;
        uint penaltyRateWad;
        uint8 tranchesCount;
        uint[] trancheAPYsWads;
        uint[] trancheBoostedAPYsWads;
        uint[] trancheCoveragesWads;
    }

    /*///////////////////////////////////
       Tranche notification functions
    ///////////////////////////////////*/

    // function onTrancheDeposit(
    //     uint8 trancheId,
    //     address depositorAddress,
    //     uint amount
    // ) external;

    // function onTrancheWithdraw(
    //     uint8 trancheId,
    //     address depositorAddress,
    //     uint amount
    // ) external;
}
