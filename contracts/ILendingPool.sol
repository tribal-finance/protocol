// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

/**
 *  @title Tribal Lending Pool contract Interface
 *
 *  You will find a term *WAD* reading this documentation. It is an integer representation 1 WAD = 1*10**18.
 *        for example, 0.2% = 0.002f = 0.002 * 10**18 = 2 * 10**15
 */
abstract contract ILendingPool {
    /////////////////////////////// INITIALIZATION //////////////////////////////////

    /**
     * @dev Called by a proxy contract to initialize the pool.
     * @param _owner Address of the smart contract owner (will be able to access administrative functions)
     * @param _borrower Address of the pool borrower
     * @param _duration The duration of the lending pool in seconds (e.g. 90 days = 90 * 24 * 60 * 60 = 7,776,000)
     * @param _targetAmount The target amount of USDC to be deposited by *lenders* (with 6 decimals e.g 1,000,000 = 1 USDC)
     * @param _fistLossCapitalAmount The target amount of USDC to be deposited by *borrower* as first loss capital (with 6 decimals e.g 1,000,000 = 1 USDC)
     * @param _lenderAPY    *wad* Annual Percentage Yield. Total amount to be harvested by *lender* from the pool is:
     *                            principalAmount * _lenderAPY * (_duration / 365days)
     * @param _boostableAPY *wad* Boostable Annual Percentage Yield. If set to 0, then the pool is not boostable.
     * @param _borrowerAIR  *wad* Borrower Interest Rate. Total amount of interest to be repaid by *borrower* is:
     *                            principalAmount * _borrowerAIR * (_duration / 365days)
     */
    function initialize(
        address _owner,
        address _borrower,
        uint _duration,
        uint _targetAmount,
        uint _fistLossCapitalAmount,
        uint _lenderAPY,
        uint _boostableAPY,
        uint _borrowerAIR
    ) external virtual;

    /////////////////////////////// ADMIN FUNCTIONS /////////////////////////////////
    /**
     * @dev Pauses all the deposits / withdrawal from the pool
     */
    function pause() external virtual;

    /**
     * @dev Unpauses all the deposits / withdrawal from the pool
     */
    function unpause() external virtual;

    /**
     * @dev Sends outstanding pool USDC balance to the address specified
     * @param _benificiary where to send the USDC balance
     */
    function drain(address _benificiary) external virtual;

    /**
     * @dev Boosts APY for the lender
     * @param _lender re to send the USDC balance
     */
    function boostAPY(address _lender) external virtual;

    /////////////////////////////// CONTRACT STATE VIEWS //////////////////////////////////
    function getDuration() public view virtual returns (uint);

    function getTargetAmount() public view virtual returns (uint);

    function getFirstLossCapitalAmount() public view virtual returns (uint);

    function getLenderAPY() public view virtual returns (uint);

    function getboostableAPY() public view virtual returns (uint);

    function getCreatedAt() public view virtual returns (uint);

    function getFundedAt() public view virtual returns (uint);

    function getRepaidAt() public view virtual returns (uint);

    /////////////////////////////// LENDER FUNCTIONS //////////////////////////////////
    /**
     * @dev deposits principal amount to the pool
     *      before depositing anything to the pool, the *lender* should get approval from USDC smart contract
     * @param _amount The amount of USDC to be deposited (with 6 decimals e.g 1,000,000 = 1 USDC)
     */
    function depositPrincipal(uint _amount) external virtual;

    /**
     * @dev withdraw the principal amount from the pool
     *  called by *lender* AFTER the pool is repaid OR BEFORE the pool is funded
     */
    function withdrawPrincipal() external virtual;

    /**
     * @dev is APY boosted for address?
     * @param _address lender address
     * @return isBoosted is APY boosted for address?
     */
    function isBoosted(
        address _address
    ) public view virtual returns (bool isBoosted);

    /**
     * @dev deposited for _address
     * @param _address lender address
     * @return amount principal amount
     */
    function getPrincipalAmount(
        address _address
    ) public view virtual returns (uint amount);

    /**
     * @dev get total yield vested by the pool for _address
     * @param _address lender address
     * @return amount vested yield
     */
    function getVestedYield(
        address _address
    ) public view virtual returns (uint amount);

    /**
     * @dev get total amount of yield claimed by _address
     * @param _address lender address
     * @return amount the claimed yield
     */
    function getClaimedYield(
        address _address
    ) public view virtual returns (uint amount);

    /**
     * @dev get total amount of yield claimable by _address.
     *      equals to getVestedYield(address) virtual - getClaimedYield(address)
     * @param _address lender address
     * @return amount claimable yield
     */
    function getClaimableYield(
        address _address
    ) public view virtual returns (uint amount);

    /////////////////////////////// BORROWER FUNCTIONS //////////////////////////////////
    /**
     *  @dev deposit first-loss capital
     */
    function depositFirstLoss() external virtual;

    /**
     *  @dev withdraw first-loss capital
     */
    function withdrawFirstLoss() external virtual;

    /**
     *  @dev borrow first-loss capital
     */
    function borrow() external virtual;

    /**
     *  @dev repay the borrowed amount
     */
    function repayPrincipal() external virtual;

    /**
     *  @dev pay interest on the borrowed amount
     * @param _amount amount of interest to pay in USDC (with 6 decimals precision e.g 1,000,000 = 1 USDC)
     */
    function payInterest(uint _amount) external virtual;

    /**
     * @dev get total interest on the borrowed amount
     * @return amount in USDC (with 6 decimals precision e.g 1,000,000 = 1 USDC)
     */
    function getTotalInterest() public view virtual returns (uint amount);

    /**
     * @dev get amount of interest on the borrowed amount that was already paid by the *borrower*
     * @return amount in USDC (with 6 decimals precision e.g 1,000,000 = 1 USDC)
     */
    function getRepaidInterest() public view virtual returns (uint amount);

    /**
     * @dev get outstanding (unpaid) virtual interest that *borrower* has to pay on the borrowed amount
     * @return amount in USDC (with 6 decimals precision e.g 1,000,000 = 1 USDC)
     */
    function getOutstandingInterest() public view virtual returns (uint amount);
}
