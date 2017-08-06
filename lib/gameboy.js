/** ** ** 
 *  Instruction set optimizations:
 *   - 4x, 5x, 6x, 7x are all the LD command with different paramters
 *     Could use Bit >> 4 to return the first character.
 *   - Similarly, 8x are all add, 9x sub, Ax and, and Bx or and cp.
 *     For Bx, B0--B7 is OR; B8--BF CP.
 * */


__halt = false;

var hardware = {
  canvas_ctx: null,

  /** 
   * 8 bit registers with pairing as 16-bits
   * 8 bits = 0--255
   * 16 bits = 0--65535
   */
  cpu_registers: [
    0, 0, // AF 0 1  10
    0, 0, // BC 2 3  23
    0, 0, // DE 4 5  45
    0, 0, // HL 6 7  67
    0,    // SP 8
    0     // PC 9
  ],
  /** F is as follows:
   * 7 6 5 4 3 2 1 0
   * Z N H C 0 0 0 0
   * */

  /** 
   * first_index = 0, 2, 4, 6
   */
  set_full_registers: function(first_index, value) {
    this.cpu_registers[first_index] = value >> 8;    
    this.cpu_registers[first_index + 1] = value & 0xFF;
  },

  get_full_registers: function(first_index) {
    return ((this.cpu_registers[first_index] << 8) +
      this.cpu_registers[first_index + 1]);
  },


  /** Memory Map
   * 0000-3FFF   16KB ROM Bank 00     (in cartridge, fixed at bank 00)
     4000-7FFF   16KB ROM Bank 01..NN (in cartridge, switchable bank number)
     8000-9FFF   8KB Video RAM (VRAM) (switchable bank 0-1 in CGB Mode)
     A000-BFFF   8KB External RAM     (in cartridge, switchable bank, if any)
     C000-CFFF   4KB Work RAM Bank 0 (WRAM)
     D000-DFFF   4KB Work RAM Bank 1 (WRAM)  (switchable bank 1-7 in CGB Mode)
     E000-FDFF   Same as C000-DDFF (ECHO)    (typically not used)
     FE00-FE9F   Sprite Attribute Table (OAM)
     FEA0-FEFF   Not Usable
     FF00-FF7F   I/O Ports
     FF80-FFFE   High RAM (HRAM)
     FFFF        Interrupt Enable Register
   * */
  memory: new Uint8Array(new ArrayBuffer(0xFFFF)),

  init: function() {
    canvas_el = document.getElementById("gamewindow");
    canvas_el.width = 160 * 3;
    canvas_el.height = 144 * 3;
    this.canvas_ctx = canvas_el.getContext("2d");
  }

};

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
  [0x0e, function() {
    opcode_methods.set_reg_to_mem(3, 9, 1);
    hardware.cpu_registers[9] += 2
  }],
  [0xaf, function() {
    hardware.cpu_registers[0] |= hardware.cpu_registers[0];
    hardware.cpu_registers[9] += 1;
  }]
]);

/** for opcode >> 4 returning 4,5,6,7; 
 *  we pass this map the second digit, and return a function
 *  which expects the first digit!
 *
 *  example. for 0x40, we perform
 *  > N = (0x40 >> 4) - 2;         = 2
 *  > opcode_ld_map.get(0x0)(N);   = opcode_methods.LDr1r2(2, 2) = LD B B
 *  > N = (0x48 >> 4) - 2;         = 2
 *  > opcode_ld_map.get(0x8)(N);   = opcode_methods.LDr1r2(3, 2) = LD C B
 * 
 * This needn't be a map... the r2 parameter is a function of the map key. So
 * we can just do a single function.
 * */
var opcode_ld_map = new Map([
  [0x0, function(Nx) { // 0xN0 : LD ?N into B
    opcode_methods.LDr1r2(Nx, 2)
  }],
  [0x8, function(Nx) {
    opcode_methods.LDr1r2(Nx + 1, 2)
  }]
]);

var opcode_ld_r1r2 = function(lowbit) {
  // expects the lower bit of the opcode
  // e.g. for 0x45 we send this 0x5
  /* xN 
   * low bit -> second parameter
   * x0,x8 = B  = 2
   * x1,x9 = C  = 3
   * x2,xA = D  = 4
   * x3,xB = E  = 5
   * x4,xC = H  = 6
   * x5,xD = L  = 7
   * x6,xE = HL = 67 ?= 1
   * x7,xF = A  = 0
   * we can use %0x8 to change 0x8 to 0x0 etc. Then we can use these as dec
   * then add 2 and modulo 8. x6 and x7 are special cases here. 
   */
  return (function(Nx) {
    opcode_methods.LDr1r2(Nx, opcode_ld_r1r2_convert(lowbit));
  });
}

var opcode_ld_r1r2_convert = function(lowbit) {
  var x = ((lowbit % 0x8) + 2) % 8
  x = (x < 2) ? (~x + 2) : x;
  return x;
}


var decode_opcode = function(opcode) {
  switch(opcode) {
    case 0x0e: // LD C n --- manual says load C into n, I think it should be n into C
      hardware.cpu_registers[3] = hardware.memory[hardware.cpu_registers[9] + 1];
      hardware.cpu_registers[9] += 2;
      break; 

    case 0xaf: // XOR A --- XOR A with A, into A. i.e. set A to 0.
      hardware.cpu_registers[0] |= hardware.cpu_registers[0];
      hardware.cpu_registers[9] += 1;
      break;

    case 0xcb: // prefix
      post = hardware.memory[hardware.cpu_registers[9] + 1];
      switch (post) {
        case 0x7c: // BIT 7, H --- tests most significant bit in H
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
          break;

        default:
          console.log("Unknown opcode: " + post.toString(16));
          __halt = true;
      }
      break;

    case 0x20: // JR NZ n --- if Z is 0, add n to current address and jump to it
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
      break;

    case 0x21: // LD HL --- put nn into HL
      hardware.cpu_registers[6] = hardware.memory[hardware.cpu_registers[9] + 2];
      hardware.cpu_registers[7] = hardware.memory[hardware.cpu_registers[9] + 1];
      hardware.cpu_registers[9] += 3;
      break;

    case 0x31: // LD SP, nn --- put nn into SP
      var n = hardware.memory[hardware.cpu_registers[9] + 1];
      var m = hardware.memory[hardware.cpu_registers[9] + 2];
      hardware.cpu_registers[8] = n | m << 8;
      hardware.cpu_registers[9] += 3;
      break;

    case 0x32: // LD HL --- puts A into memory pointed to by HL and decrements HL
      hardware.memory[(hardware.cpu_registers[6] << 8) 
        + hardware.cpu_registers[7]] = hardware.cpu_registers[0];
      decrement_full_reg(6); // decrement HL
      hardware.cpu_registers[9] += 1;
      break;

    case 0x3e: // LD A --- loads n into A
      hardware.cpu_registers[0] = hardware.memory[hardware.cpu_registers[9] + 1];
      hardware.cpu_registers[9] += 2;
      break;

    case 0xe2: // LD C, A --- put A into address 0xFF00 + C
      hardware.memory[0xFF00 + hardware.cpu_registers[3]] = hardware.cpu_registers[0];
      hardware.cpu_registers[9] += 1;
      break;

    default:
      console.log("Unknown opcode: " + opcode.toString(16));
      __halt = true;
  }

}

var re;
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

