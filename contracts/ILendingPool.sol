// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

/**
 *  @title Tribal Lending Pool contract Interface
 * 
 *  @note You will find a term *WAD* reading this documentation. It is an integer representation 1 WAD = 1*10**18.
 *        for example, 0.2% = 0.002f = 0.002 * 10**18 = 2 * 10**15
 */
interface ILendingPool {
    /////////////////////////////// INITIALIZATION //////////////////////////////////

    /**
     * @dev Called by a proxy contract to initialize the pool.
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
        uint _duration,
        uint _targetAmount,
        uint _firstLossCapitalAmount,
        uint _lenderAPY,
        uint _boostableAPY,
        uint _borrowerAIR,
    );

    /////////////////////////////// CONTRACT STATE VIEWS //////////////////////////////////
    function getDuration() public view returns (uint);
    function getTargetAmount() public view returns (uint);
    function getFirstLossCapitalAmount() public view returns (uint);

    function getLenderAPY() public view returns (uint);
    function getboostableAPY() public view returns (uint);

    function getLenderAPY() public view returns (uint);
    function getCreatedAt() public view returns (uint);
    function getFundedAt() public view returns (uint);
    function getRepaidAt() public view returns (uint);

    /////////////////////////////// LENDER FUNCTIONS //////////////////////////////////
    /**
     * @dev deposits principal amount to the pool
     * @note before depositing anything to the pool, the *lender* should get approval from USDC smart contract
     * @param _amount The amount of USDC to be deposited (with 6 decimals e.g 1,000,000 = 1 USDC)
     */
    function depositPrincipal(uint _amount) external;

    /**
     * @dev withdraw the principal amount from the pool
     * @note called by *lender* AFTER the pool is repaid OR BEFORE the pool is funded
     */
    function withdrawPrincipal() external;

    /**
     * @dev is APY boosted for address?
     * @param _address
     * @return isBoosted is APY boosted for address?
     */
    function isBoosted(address _address) public view returns(bool isBoosted);

    /**
     * @dev deposited for _address
     * @param _address
     * @return amount principal amount
     */
    function getPrincipalAmount(address _address) public view returns(amount uint);

    /**
     * @dev get total yield vested by the pool for _address
     * @param _address
     * @return amount vested yield
     */
    function getVestedYield(address _address) public view returns(uint amount);

    /**
     * @dev get total amount of yield claimed by _address
     * @param _address
     * @return the claimed yield
     */
    function getClaimedYield(address _address) public view returns(uint amount);

    /**
     * @dev get total amount of yield claimable by _address.
     *      equals to getVestedYield(address) - getClaimedYield(address)
     * @param _address
     */
    function getClaimableYield(address _address) public view returns(uint amount);

    /////////////////////////////// BORROWER FUNCTIONS //////////////////////////////////
    function depositFirstLoss();
    function WithdrawFirstLoss();
    function borrow() external;
    function repayPrincipal() external;

    function repayInterest() external;
    function getTotalInterest() public view returns(uint amount);
    function getRepaidInterest() public view returns(uint amount);
    function getOutstandingInterest() public view returns(uint amount);
}
