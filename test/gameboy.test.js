describe('Gameboy', function() {

	it('0x0e should increment PC', function() {
    opcode_map.get(0x0e)();
    expect(hardware.cpu_registers[9] == 2);
  });

  it('set and get 16 bit registers', function() {
    hardware.set_full_registers(6, 5050);
    expect(hardware.get_full_registers(6) == 5050)
  });

  it('opcode ld converter full test', function() {
    // 0x0 through to 0xF
    input = Array.apply(null, Array(16)).map(function (_, i) {return i;});
    expectedoutput = [2,3,4,5,6,7,1,0,
                      2,3,4,5,6,7,1,0];
    output = [] 
    for (let i = 0, l = input.length; i < l; i++) {
      output[i] = opcode_ld_r1r2_convert(input[i]);
    }
    equal = true;
    for (let i = 0, l = output.length; i < l; i++) {
      if (output[i] != expectedoutput[i]) {
        equal = false;
        break;
      }
    }
    expect(equal === true);
  });

});
