// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.18;

/** @dev state variables + getters, setters and events for LendingPool
 */
abstract contract LendingPoolState {
    /*//////////////////////////////////////
      Initial parameters
    //////////////////////////////////////*/

    /* name */
    string private s_name;
    event ChangeName(address indexed actor, string oldValue, string newValue);

    function name() public view returns (string memory) {
        return s_name;
    }

    function _setName(string calldata newValue) internal {
        string memory oldValue = s_name;
        s_name = newValue;
        emit ChangeName(msg.sender, oldValue, newValue);
    }

    /* token */
    string private s_token;
    event ChangeToken(address indexed actor, string oldValue, string newValue);

    function token() public view returns (string memory) {
        return s_token;
    }

    function _setToken(string calldata newValue) internal {
        string memory oldValue = s_token;
        s_token = newValue;
        emit ChangeToken(msg.sender, oldValue, newValue);
    }

    /* stableCoinContractAddress */
    address private s_stableCoinContractAddress;
    event ChangeStableCoinContractAddress(
        address indexed actor,
        address oldValue,
        address newValue
    );

    function stableCoinContractAddress() public view returns (address) {
        return s_stableCoinContractAddress;
    }

    function _setStableCoinContractAddress(address newValue) internal {
        address oldValue = s_stableCoinContractAddress;
        s_stableCoinContractAddress = newValue;
        emit ChangeStableCoinContractAddress(msg.sender, oldValue, newValue);
    }

    /* minFundingCapacity */
    uint private s_minFundingCapacity;
    event ChangeMinFundingCapacity(
        address indexed actor,
        uint oldValue,
        uint newValue
    );

    function minFundingCapacity() public view returns (uint) {
        return s_minFundingCapacity;
    }

    function _setMinFundingCapacity(uint newValue) internal {
        uint oldValue = s_minFundingCapacity;
        s_minFundingCapacity = newValue;
        emit ChangeMinFundingCapacity(msg.sender, oldValue, newValue);
    }

    /* maxFundingCapacity */
    uint private s_maxFundingCapacity;
    event ChangeMaxFundingCapacity(
        address indexed actor,
        uint oldValue,
        uint newValue
    );

    function maxFundingCapacity() public view returns (uint) {
        return s_maxFundingCapacity;
    }

    function _setMaxFundingCapacity(uint newValue) internal {
        uint oldValue = s_maxFundingCapacity;
        s_maxFundingCapacity = newValue;
        emit ChangeMaxFundingCapacity(msg.sender, oldValue, newValue);
    }

    /* fundingPeriodSeconds */
    int64 private s_fundingPeriodSeconds;
    event ChangeFundingPeriodSeconds(
        address indexed actor,
        int64 oldValue,
        int64 newValue
    );

    function fundingPeriodSeconds() public view returns (int64) {
        return s_fundingPeriodSeconds;
    }

    function _setFundingPeriodSeconds(int64 newValue) internal {
        int64 oldValue = s_fundingPeriodSeconds;
        s_fundingPeriodSeconds = newValue;
        emit ChangeFundingPeriodSeconds(msg.sender, oldValue, newValue);
    }

    /* lendingTermSeconds */
    int64 private s_lendingTermSeconds;
    event ChangeLendingTermSeconds(
        address indexed actor,
        int64 oldValue,
        int64 newValue
    );

    function lendingTermSeconds() public view returns (int64) {
        return s_lendingTermSeconds;
    }

    function _setLendingTermSeconds(int64 newValue) internal {
        int64 oldValue = s_lendingTermSeconds;
        s_lendingTermSeconds = newValue;
        emit ChangeLendingTermSeconds(msg.sender, oldValue, newValue);
    }

    /* borrowerAddress */
    address private s_borrowerAddress;
    event ChangeBorrowerAddress(
        address indexed actor,
        address oldValue,
        address newValue
    );

    function borrowerAddress() public view returns (address) {
        return s_borrowerAddress;
    }

    function _setBorrowerAddress(address newValue) internal {
        address oldValue = s_borrowerAddress;
        s_borrowerAddress = newValue;
        emit ChangeBorrowerAddress(msg.sender, oldValue, newValue);
    }

    /* borrowerTotalInterestRateWad */
    uint private s_borrowerTotalInterestRateWad;
    event ChangeBorrowerTotalInterestRateWad(
        address indexed actor,
        uint oldValue,
        uint newValue
    );

    function borrowerTotalInterestRateWad() public view returns (uint) {
        return s_borrowerTotalInterestRateWad;
    }

    function _setBorrowerTotalInterestRateWad(uint newValue) internal {
        uint oldValue = s_borrowerTotalInterestRateWad;
        s_borrowerTotalInterestRateWad = newValue;
        emit ChangeBorrowerTotalInterestRateWad(msg.sender, oldValue, newValue);
    }

    /* collateralRatioWad */
    uint private s_collateralRatioWad;
    event ChangeCollateralRatioWad(
        address indexed actor,
        uint oldValue,
        uint newValue
    );

    function collateralRatioWad() public view returns (uint) {
        return s_collateralRatioWad;
    }

    function _setCollateralRatioWad(uint newValue) internal {
        uint oldValue = s_collateralRatioWad;
        s_collateralRatioWad = newValue;
        emit ChangeCollateralRatioWad(msg.sender, oldValue, newValue);
    }

    /* defaultPenalty */
    uint private s_defaultPenalty;
    event ChangeDefaultPenalty(
        address indexed actor,
        uint oldValue,
        uint newValue
    );

    function defaultPenalty() public view returns (uint) {
        return s_defaultPenalty;
    }

    function _setDefaultPenalty(uint newValue) internal {
        uint oldValue = s_defaultPenalty;
        s_defaultPenalty = newValue;
        emit ChangeDefaultPenalty(msg.sender, oldValue, newValue);
    }

    /* penaltyRateWad */
    uint private s_penaltyRateWad;
    event ChangePenaltyRateWad(
        address indexed actor,
        uint oldValue,
        uint newValue
    );

    function penaltyRateWad() public view returns (uint) {
        return s_penaltyRateWad;
    }

    function _setPenaltyRateWad(uint newValue) internal {
        uint oldValue = s_penaltyRateWad;
        s_penaltyRateWad = newValue;
        emit ChangePenaltyRateWad(msg.sender, oldValue, newValue);
    }

    /* tranchesCount */
    uint8 private s_tranchesCount;
    event ChangeTranchesCount(
        address indexed actor,
        uint8 oldValue,
        uint8 newValue
    );

    function tranchesCount() public view returns (uint8) {
        return s_tranchesCount;
    }

    function _setTranchesCount(uint8 newValue) internal {
        uint8 oldValue = s_tranchesCount;
        s_tranchesCount = newValue;
        emit ChangeTranchesCount(msg.sender, oldValue, newValue);
    }

    /* trancheAPYsWads */
    uint[] private s_trancheAPYsWads;
    event ChangeTrancheAPYsWads(
        address indexed actor,
        uint[] oldValue,
        uint[] newValue
    );

    function trancheAPYsWads() public view returns (uint[] memory) {
        return s_trancheAPYsWads;
    }

    function _setTrancheAPYsWads(uint[] calldata newValue) internal {
        uint[] memory oldValue = s_trancheAPYsWads;
        s_trancheAPYsWads = newValue;
        emit ChangeTrancheAPYsWads(msg.sender, oldValue, newValue);
    }

    /* trancheBoostedAPYsWads */
    uint[] private s_trancheBoostedAPYsWads;
    event ChangeTrancheBoostedAPYsWads(
        address indexed actor,
        uint[] oldValue,
        uint[] newValue
    );

    function trancheBoostedAPYsWads() public view returns (uint[] memory) {
        return s_trancheBoostedAPYsWads;
    }

    function _setTrancheBoostedAPYsWads(uint[] calldata newValue) internal {
        uint[] memory oldValue = s_trancheBoostedAPYsWads;
        s_trancheBoostedAPYsWads = newValue;
        emit ChangeTrancheBoostedAPYsWads(msg.sender, oldValue, newValue);
    }

    /* trancheCoverages */
    uint[] private s_trancheCoveragesWads;
    event ChangeTrancheCoveragesWads(
        address indexed actor,
        uint[] oldValue,
        uint[] newValue
    );

    function trancheCoveragesWads() public view returns (uint[] memory) {
        return s_trancheCoveragesWads;
    }

    function _setTrancheCoveragesWads(uint[] calldata newValue) internal {
        uint[] memory oldValue = s_trancheCoveragesWads;
        s_trancheCoveragesWads = newValue;
        emit ChangeTrancheCoveragesWads(msg.sender, oldValue, newValue);
    }

    /*//////////////////////////////////////
      Other contract addresses
    //////////////////////////////////////*/

    /* feeSharingContractAddress */
    address private s_feeSharingContractAddress;
    event ChangeFeeSharingContractAddress(
        address indexed actor,
        address oldValue,
        address newValue
    );

    function feeSharingContractAddress() public view returns (address) {
        return s_feeSharingContractAddress;
    }

    function _setFeeSharingContractAddress(address newValue) internal {
        address oldValue = s_feeSharingContractAddress;
        s_feeSharingContractAddress = newValue;
        emit ChangeFeeSharingContractAddress(msg.sender, oldValue, newValue);
    }

    /* firstLossCapitalVaultAddress */
    address private s_firstLossCapitalVaultAddress;
    event ChangeFirstLossCapitalVaultAddress(
        address indexed actor,
        address oldValue,
        address newValue
    );

    function firstLossCapitalVaultAddress() public view returns (address) {
        return s_firstLossCapitalVaultAddress;
    }

    function _setFirstLossCapitalVaultAddress(address newValue) internal {
        address oldValue = s_firstLossCapitalVaultAddress;
        s_firstLossCapitalVaultAddress = newValue;
        emit ChangeFirstLossCapitalVaultAddress(msg.sender, oldValue, newValue);
    }

    /* trancheVaultAddresses */
    address[] private s_trancheVaultAddresses;
    event ChangeTrancheVaultAddresses(
        address indexed actor,
        address[] oldValue,
        address[] newValue
    );

    function trancheVaultAddresses() public view returns (address[] memory) {
        return s_trancheVaultAddresses;
    }

    function _setTrancheVaultAddresses(address[] calldata newValue) internal {
        address[] memory oldValue = s_trancheVaultAddresses;
        s_trancheVaultAddresses = newValue;
        emit ChangeTrancheVaultAddresses(msg.sender, oldValue, newValue);
    }

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[50] private __gap;
}
