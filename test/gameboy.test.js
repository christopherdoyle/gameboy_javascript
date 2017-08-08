describe('Gameboy', function() {

	it('0x0e should increment PC', function() {
    opcode_map.get(0x0e)();
    expect(hardware.cpu_registers[9]).toBe(2);
  });

  it('set and get 16 bit registers', function() {
    hardware.set_full_registers(6, 5050);
    expect(hardware.get_full_registers(6)).toBe(5050);
  });

  it('opcode ld lowbit converter full test', function() {
    // 0x0 through to 0xF
    input = Array.apply(null, Array(16)).map(function (_, i) {return i;});
    expectedoutput = [2,3,4,5,6,7,67,0,
                      2,3,4,5,6,7,67,0];
    output = [];
    for (let i = 0, l = input.length; i < l; i++) {
      output[i] = lowbit_convert(input[i]);
    }
    equal = true;
    for (let i = 0, l = output.length; i < l; i++) {
      if (output[i] != expectedoutput[i]) {
        equal = false;
        break;
      }
    }
    expect(equal).toBe(true);
  });

  it('opcode ld highbit converter full test', function() {
    // 0x0 through to 0xF
    input = Array.apply(null, Array(64)).map(function (_, i) {return (64 + i);});
    expectedoutput = [2,2,2,2,2,2,2,2,
                      3,3,3,3,3,3,3,3,
                      4,4,4,4,4,4,4,4,
                      5,5,5,5,5,5,5,5,
                      6,6,6,6,6,6,6,6,
                      7,7,7,7,7,7,7,7,
                      67,67,67,67,67,67,67,67,
                      0,0,0,0,0,0,0,0];
    output = [];
    for (let i = 0, l = input.length; i < l; i++) {
      output[i] = opcode_ld_r1r2.highbit_convert(input[i]);
    }
    equal = true;
    for (let i = 0, l = output.length; i < l; i++) {
      if (output[i] != expectedoutput[i]) {
        equal = false;
        break;
      }
    }
    expect(equal).toBe(true);
  });
 

  /*
   * 40--47 = 64--71   = B    = 2
   * 48--4F = 72--79   = C    = 3 
   * 50--57 = 80--87   = D    = 4
   * 58--5F = 88--95   = E    = 5
   * 60--67 = 96--103  = H    = 6
   * 68--6F = 104--111 = L    = 7
   * 70--77 = 112-119  = (HL) = 67 (1)
   * 78--7F = 120-127  = A    = 0
   */
  
});
