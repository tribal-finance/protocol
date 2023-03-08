function genDefinition(_type, _name) {
  const capitalizedName = _name.charAt(0).toUpperCase() + _name.slice(1);

  return `
    /* ${_name} */
    ${_type} private s_${_name};
    event Change${capitalizedName}(address indexed actor, ${_type} oldValue, ${_type} newValue);
    function ${_name}() public view returns (${_type}) { return s_${_name}; }
    function _set${capitalizedName}(${_type} newValue) internal {
        ${_type} oldValue = s_${_name};
        s_${_name} = newValue;
        emit Change${capitalizedName}(msg.sender, oldValue, newValue);
    }
  `;
}

const vars = [
  "string name",
  "string token",
  "address stableCoinContractAddress",
  "address feeSharingContractAddress",
  "uint minFundingCapacity",
  "uint maxFundingCapacity",
  "int64 fundingPeriodSeconds",
  "int64 lendingTermSeconds",
  "address borrowerAddress",
  "uint borrowerTotalInterestRateWad",
  "uint collateralRatioWad",
  "uint defaultPenalty",
  "uint penaltyRateWad",
];

const vars2 = [
  "uint8 tranchesCount",
  "address[] memory trancheVaultAddresses",
  "uint[] memory trancheAPRsWads",
  "uint[] memory trancheBoostedAPRsWads",
  "uint[] memory trancheCoveragesWads",
];

const vars3 = [
  "address firstLossCapitalVaultAddress",
  "address[] memory trancheVaultAddresses",
];

const vars4 = [
  "bool withdrawEnabled",
  "bool depositEnabled",
  "bool transferEnabled",
];

const vars5 = [
  "uint64 openedAt",
  "uint64 fundedAt",
  "uint64 fundingFailedAt",
  "uint64 flcDepositedAt",
  "uint64 repaidAt",
];

const vars6 = [
  // "uint borrowerInterestRepaid",
  //"uint borrowedAmount",
  //"uint64 interestRepaidAt",
  // "uint protocolFeeWad",
  // "uint poolBalanceThreshold"
  // "uint64 delinquentAt"
  "uint firstLossAssets",
  "uint repaymentRecurrenceDays",
  "uint gracePeriodDays",
];

for (let v of vars6) {
  const split = v.split(" ");
  const _name = split.pop();
  const _type = split.join(" ");
  console.log(genDefinition(_type, _name));
}
