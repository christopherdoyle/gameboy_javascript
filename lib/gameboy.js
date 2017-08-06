/** ** ** 
 *  Instruction set optimizations:
 *   - 4x, 5x, 6x, 7x are all the LD command with different paramters
 *     Could use Bit >> 4 to return the first character.
 *   - Similarly, 8x are all add, 9x sub, Ax and, and Bx or and cp.
 *     For Bx, B0--B7 is OR; B8--BF CP.
 * */


__halt = false;

var load_game = function() {
  var req = new XMLHttpRequest();
  req.onload = function(_event) {
    var buf = req.response;
    if (buf) {
      var prog_data = new Uint8Array(buf);
      for (let i = 0, l = prog_data.length; i < l; i++) {
        hardware.memory[i] = prog_data[i];
      }
      start();
    }
  }
  req.open("GET", "DMG_ROM.bin");
  req.responseType = "arraybuffer";
  req.send();
};

var opcode_methods = {
  decrement_full_reg : function(n) {
    var fullvalue = (hardware.cpu_registers[n] << 8) + hardware.cpu_registers[n + 1];
    fullvalue -= 1;
    hardware.cpu_registers[n] = fullvalue >> 8;
    hardware.cpu_registers[n + 1] = fullvalue & 0xff;
  },
  
  set_reg_to_mem : function(to_set, pointer_to_mem, mem_offset) {
    hardware.cpu_registers[to_set] = hardware.memory[
      hardware.cpu_registers[pointer_to_mem] + mem_offset];
  },

  LDr1r2:
  /* Loads value r2 into r1 
   * r1, r2: registers A,B,C,D,E,H,L,(HL) with some restrictions on
   * combinations
   *         input should be numerical, corresponding to
   *                   0,2,3,4,5,6,7,(67)
   * note that while r1 can equal r2 in most cases, they are never both HL!
   */
  function(r1, r2, cycles) {
    if (r1 == 67) {
      hardware.set_full_registers(6, hardware.cpu_registers[r2]);
    } else {
      if (r2 == 67) {
        hardware.cpu_registers[r1] = hardware.get_full_registers[6];
      } else {
        hardware.cpu_registers[r1] = hardware.cpu_registers[r2];
      }
    }
  }
}

var opcode_map = new Map([
  [0x0e, // LD C n --- manual says load C into n, I think it should be n into C
    function() {
      opcode_methods.set_reg_to_mem(3, 9, 1);
      hardware.cpu_registers[9] += 2
    }
  ],[0xaf, // XOR A --- XOR A with A, into A. i.e. set A to 0.
    function() {
      hardware.cpu_registers[0] |= hardware.cpu_registers[0];
      hardware.cpu_registers[9] += 1;
    }
  ],[0xcb, // prefix
    function() {
      opcode_secondary_map.get(hardware.memory[hardware.cpu_registers[9] + 1])();
  }
  ],[0x20, // JR NZ n --- if Z is 0, add n to current address and jump to it
    function() { 
      // current address = address following JR NZ n, i.e. +2
      if (! (hardware.cpu_registers[1] >> 7)) {
        // n is signed
        var n = hardware.memory[hardware.cpu_registers[9] + 1];
        if (n >> 7) { // then it's negative
          n -= (0xFF + 1);
        }
        hardware.cpu_registers[9] += n;
      }
      hardware.cpu_registers[9] += 2;
    }
  ],[0x21, // LD HL --- put nn into HL
    function() {
      hardware.cpu_registers[6] = hardware.memory[hardware.cpu_registers[9] + 2];
      hardware.cpu_registers[7] = hardware.memory[hardware.cpu_registers[9] + 1];
      hardware.cpu_registers[9] += 3;
    }
  ],[0x31, // LD SP, nn --- put nn into SP
    function() {
      var n = hardware.memory[hardware.cpu_registers[9] + 1];
      var m = hardware.memory[hardware.cpu_registers[9] + 2];
      hardware.cpu_registers[8] = n | m << 8;
      hardware.cpu_registers[9] += 3;
    }
  ],[0x32, // LD HL --- puts A into memory pointed to by HL and decrements HL
    function() {
      hardware.memory[(hardware.cpu_registers[6] << 8) 
        + hardware.cpu_registers[7]] = hardware.cpu_registers[0];
      opcode_methods.decrement_full_reg(6); // decrement HL
      hardware.cpu_registers[9] += 1;
    }
  ],[0x3e, // LD A --- loads n into A
    function() {
      hardware.cpu_registers[0] = hardware.memory[hardware.cpu_registers[9] + 1];
      hardware.cpu_registers[9] += 2;
    }
  ],[0xe2, // LD C, A --- put A into address 0xFF00 + C
    function() {
      hardware.memory[0xFF00 + hardware.cpu_registers[3]] = hardware.cpu_registers[0];
      hardware.cpu_registers[9] += 1;
    }
  ]
]);

var opcode_secondary_map = new Map([
  [0x7c, // BIT 7, H --- tests most significant bit in H
    function() {
      if (hardware.cpu_registers[6] >> 7) { // if 1
        // reset Z, reset N, set H, leave C 
        hardware.cpu_registers[1] &= 0b00111111;
        hardware.cpu_registers[1] |= 0b00100000;
      } else {
        // set Z, reset N, set H, leave C
        hardware.cpu_registers[1] &= 0b10111111;
        hardware.cpu_registers[1] |= 0b10100000;
      }
      hardware.cpu_registers[9] += 2;
    }
  ]
]);

/* Caller for this function has already decomposed the opcode into high and low
 * bit. 
 * This functions expects the lower bit, e.g. for 0x45 it expects 0x5.
 */
var opcode_ld_r1r2 = function(lowbit) {
  return (function(highbit) { 
    opcode_methods.LDr1r2(
      opcode_ld_r1r2_lowbit_convert(((highbit - 64) / 8) >> 0),
      opcode_ld_r1r2_lowbit_convert(lowbit),
      opcode_ld_r1r2_compute_clock(highbit, lowbit)
    );
  });
}

var opcode_ld_r1r2_compute_clock = function(highbit, lowbit) {
  // clock is 8 for: 70--75, 77, 46, 56, 66, 4E, 5E, 6E, 7E
  // 0x76 is HALT and should be caught already so we don't worry bout it
  // actually being a count of 4.
  if (highbit == 0x7 && (lowbit < 0x8)) {
    return 8;
  } else if ((lowbit == 0x6 || lowbit == 0xE) {
      return 8;
  } else {
    return 4;
  }
}

/** 
 * REDUNDANT.
 * For testing code inside of opcode_ld_r1r2.
 */
var opcode_ld_r1r2_highbit_convert = function(highbit) {
  var x = opcode_ld_r1r2_lowbit_convert(((highbit - 64) / 8) >> 0);
}

var opcode_ld_r1r2_lowbit_convert = function(lowbit) {
  /* low bit -> second parameter
   * x0,x8 = B  = 2
   * x1,x9 = C  = 3
   * x2,xA = D  = 4
   * x3,xB = E  = 5
   * x4,xC = H  = 6
   * x5,xD = L  = 7
   * x6,xE = HL = 67 (1)
   * x7,xF = A  = 0
   */
  // one line?
  var x = ((lowbit % 0x8) + 2) % 8
  x = (x == 0) ? 67 : x;
  x = (x == 1) ? 0 : x;
  return x;
}


var decode_opcode = function(opcode) {
  high = opcode >> 4;
  low = opcode & 0x0F;

  switch(high) {
      case 0x4:
      case 0x5:
      case 0x6:
      opcode_ld_r1r2(low)(high);
      hardware.cpu_registers[9] += 1;
      break;

      case 0x7:
      if (low == 6) {
        // NOT FULLY IMPLEMENTED (requires interrupts)
        __halt = true;
      } else {
        opcode_ld_r1r2(low)(high);
      }
      hardware.cpu_registers[9] += 1;
      break;

    default:
      opcode_map.get(opcode)();
  }
}

var start = function(prog_data) {
  while (true) {
    console.log(" > " + hardware.memory[hardware.cpu_registers[9]].toString(16));
    decode_opcode(hardware.memory[hardware.cpu_registers[9]]);
    if (__halt) {
      break;
    }
  }
}

//load_game();

