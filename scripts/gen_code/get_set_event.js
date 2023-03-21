function genDefinition(_type, _name) {
  const capitalizedName = _name.charAt(0).toUpperCase() + _name.slice(1);

  return `
    /* ${_name} */
    ${_type} private s_${_name};
    event Change${capitalizedName}(${_type} oldValue, ${_type} newValue);
    function ${_name}() public view returns (${_type}) { return s_${_name}; }
    function _set${capitalizedName}(${_type} newValue) internal {
        ${_type} oldValue = s_${_name};
        s_${_name} = newValue;
        emit Change${capitalizedName}(oldValue, newValue);
    }
  `;
}

const vars = {
  // poolAddress: "address",
  id: "int8",
  // minFundingCapacity: "uint256",
  // maxFundingCapacity: "uint256",
};

for (const [name, type] of Object.entries(vars)) {
  console.log(genDefinition(type, name));
}
