/** ** ** 
 *  Instruction set optimizations:
 *   - 4x, 5x, 6x, 7x are all the LD command with different paramters
 *     Could use Bit >> 4 to return the first character.
 *   - Similarly, 8x are all add, 9x sub, Ax and, and Bx or and cp.
 *     For Bx, B0--B7 is OR; B8--BF CP.
 * 
 * TODO
 *  1. Timers and counters!
 *  1. Opcodes
 *  2. Get bootloader running without error and verify
 *  2. Tests
 *  3. Graphics
 *  4. Sound
* */

/* ESLINT */
/*global hardware:true*/

(function () {
  "use strict";

  let __halt = false;

  window.load_game = function() {
    const req = new XMLHttpRequest();
    req.onload = function() {
      const buf = req.response;
      if (buf) {
        const prog_data = new Uint8Array(buf);
        const l = prog_data.length;
        for (let i = 0; i < l; i++) {
          hardware.memory[i] = prog_data[i];
        }
        start();
      }
    };
    req.open("GET", "DMG_ROM.bin");
    req.responseType = "arraybuffer";
    req.send();
  };

  const opcode_methods = {
    decrement_full_reg : function(n) {
      let fullvalue = (hardware.cpu_registers[n] << 8) + hardware.cpu_registers[n + 1];
      fullvalue -= 1;
      hardware.cpu_registers[n] = fullvalue >> 8;
      hardware.cpu_registers[n + 1] = fullvalue & 0xff;
    },

    set_reg_to_mem : function(to_set, pointer_to_mem, mem_offset) {
      hardware.cpu_registers[to_set] = hardware.memory[
        hardware.cpu_registers[pointer_to_mem] + mem_offset];
    },

    set_reg_to_mem_16 : function(to_set, pointer_to_mem, mem_offset) {
      hardware.set_full_register((to_set / 10) >> 0, hardware.memory[
        hardware.cpu_registers[pointer_to_mem] + mem_offset]);
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
    },

    LD_A_regn:
    /* Loads register n into A. n can be 8 or 16 bits.
    */
    function(n, cycles) {
      if (n < 10) {
        hardware.cpu_registers[0] = hardware.cpu_registers[n];
      } else {
        hardware.cpu_registers[0] = hardware.get_full_registers[(n / 10) >> 0];
      }
    }
  };

  const opcode_map = new Map([
    [0x0e, // LD C n --- manual says load C into n, I think it should be n into C
      function() {
        opcode_methods.set_reg_to_mem(3, 9, 1);
        hardware.cpu_registers[9] += 2;
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
          let n = hardware.memory[hardware.cpu_registers[9] + 1];
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
        const n = hardware.memory[hardware.cpu_registers[9] + 1];
        const m = hardware.memory[hardware.cpu_registers[9] + 2];
        hardware.cpu_registers[8] = n | m << 8;
        hardware.cpu_registers[9] += 3;
      }
    ],[0x32, // LD HL --- puts A into memory pointed to by HL and decrements HL
      function() {
        hardware.memory[(hardware.cpu_registers[6] << 8) + 
          hardware.cpu_registers[7]] = hardware.cpu_registers[0];
        opcode_methods.decrement_full_reg(6); // decrement HL
        hardware.cpu_registers[9] += 1;
      }
    ],[0x3e, // LD A --- loads n into A
      function() {
        hardware.cpu_registers[0] = hardware.memory[hardware.cpu_registers[9] + 1];
        hardware.cpu_registers[9] += 2;
      }
    ],[0xcd,
      function() {
        opcode_call.nn();
      }
    ],[0xe0, // LDH (n), A --- two bit load; puts A into 0xFF00 + n. 12 cycles
      function() {
        hardware.memory[0xFF00 + hardware.memory[hardware.cpu_registers[9] + 1]] = hardware.cpu_registers[0];
        hardware.cpu_registers[9] += 2;
      }
    ],[0xe2, // LD C, A --- put A into address 0xFF00 + C
      function() {
        hardware.memory[0xFF00 + hardware.cpu_registers[3]] = hardware.cpu_registers[0];
        hardware.cpu_registers[9] += 1;
      }
    ]
  ]);

  const opcode_secondary_map = new Map([
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
  const opcode_ld_r1r2 = {
    compute: function(lowbit) {
      return (function(highbit) { 
        opcode_methods.LDr1r2(
          lowbit_convert(((highbit - 64) / 8) >> 0),
          lowbit_convert(lowbit),
          opcode_ld_r1r2.compute_clock(lowbit, highbit)
        );
      });
    },

    compute_clock: function(highbit, lowbit) {
      // clock is 8 for: 70--75, 77, 46, 56, 66, 4E, 5E, 6E, 7E
      // 0x76 is HALT and should be caught already so we don't worry bout it
      // actually being a count of 4.
      if (highbit == 0x7 && (lowbit < 0x8)) {
        return 8;
      } else if ((lowbit == 0x6 || lowbit == 0xE)) {
        return 8;
      } else {
        return 4;
      }
    },

    /** 
     * REDUNDANT.
     * For testing code inside of opcode_ld_r1r2.
     */
    highbit_convert: function(highbit) {
      return (lowbit_convert(((highbit - 64) / 8) >> 0));
    }

  };

  const opcode_ld = {

    LD_nnn : // load 16 bit NN into reg n. CYCLES = 12
    function(highbit) {
      if (highbit == 0x3) {
        hardware.cpu_registers[8] = hardware.memory[hardware.cpu_registers[9] + 1] 
          | (hardware.memory[hardware.cpu_registers[9] + 2] << 8);
      } else {
        hardware.cpu_registers[(highbit * 2) + 3] = 
          hardware.memory[hardware.cpu_registers[9] + 1]; // lowbit
        hardware.cpu_registers[(highbit * 2) + 2] = 
          hardware.memory[hardware.cpu_registers[9] + 2]; // highbit
      }
      hardware.cpu_registers[9] += 3;
    },

    LD_nn_n:
    function(opcode) {
      /* 
        0x06  6 B  2
        0x0E 14 C  3
        0x16 22 D  4
        0x1E 30 E  5
        0x26 38 H  6
        0x2E 46 L  7
        0x36 52 HL 67
        0x3E 60 A  0
        */
      const n = lowbit_convert((opcode - 6) / 8);
      if (n == 67) {
        opcode_methods.set_reg_to_mem_16(n, 9, 1);
      } else {
        opcode_methods.set_reg_to_mem(n, 9, 1);
      }
      hardware.cpu_registers[9] += 2;
    }

  };

  const lowbit_convert = function(lowbit) {
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
    let x = ((lowbit % 0x8) + 2) % 8;
    x = (x == 0) ? 67 : x;
    x = (x == 1) ? 0 : x;
    return x;
  };

  const opcode_arithmetic = {
    add_An: function(low) { // add n to A 
      const ni = lowbit_convert(low);
      const n = (ni == 67) ? hardware.get_full_registers(6) : hardware.cpu_registers[ni];
      const A = hardware.cpu_registers[0]; // store for checking
      if (n != 67) {
        hardware.cpu_registers[0] += n;
      } else { // HL
        hardware.cpu_registers[0] += n;
      }
      // reset N flag
      hardware.cpu_registers[1] &= 0b10111111;
      // Set Z if answer is 0
      if (hardware.cpu_registers[0] == 0) {
        hardware.cpu_registers[1] |= 0b10000000;
      } else {
        hardware.cpu_registers[1] &= 0b01111111;
      }
      /** 
      WARNING: I DON'T KNOW IF THESE ARE CORRECT
      */
      // H : set if carry from bit 3
      if ( (((A & 0xf) + (n & 0xf)) & 0x10) == 0x10) {
        hardware.cpu_registers[1] |= 0b00100000;
      } else {
        hardware.cpu_registers[1] &= 0b11011111;
      }
      // C : set if carry from bit 7
      if ( (((A >> 4) + (n >> 4)) & 0x10) == 0x10) {
        hardware.cpu_registers[1] |= 0b00010000;
      } else {
        hardware.cpu_registers[1] &= 0b11101111;
      }
    },

    adc_An: function(low) {
      console.log("adc_An: unimplemented. Halting.");
      __halt = true;
    },

    /**
     * Increments register.
     * CYCLES: 4
        04 = 4  = B     2
        0C = 12 = C     3
        14 = 20 = D     4
        1C = 28 = E     5
        24 = 36 = H     6
        2C = 44 = L     7
        34 = 52 = (HL)  67
        3C = 60 = A     0
     * */
    inc8bit: function(opcode) {
      const n = lowbit_convert((opcode - 4) / 8);
      if (n == 67) {
        hardware.set_full_registers(6, 
          hardware.get_full_registers(6) + 1);
      } else {
        hardware.cpu_registers[n] += 1;
      }
    }
  };


  const opcode_call = {

    nn: // push address of next instruction onto stack and jump nn
    function() { // CYCLES: 12
      hardware.stack.push(hardware.memory[hardware.cpu_registers[9] + 3]);
      hardware.cpu_registers[9] = (hardware.memory[hardware.cpu_registers[9] + 1]) + 
        (hardware.memory[hardware.cpu_registers[9] + 2] << 8);
    },

    push: // C 12 BC 2 | D 13 DE 4 | E 14 HL 6 | F 15 AF 1  
    function(highbit) {
      hardware.stack.push(hardware.cpu_registers[lowbit_convert(highbit - 4)]);
    }

  };


  const decode_opcode = function(opcode) {
    let high = opcode >> 4;
    let low = opcode & 0x0F;

    switch(high) {
      case 0x0:
      case 0x1:
      case 0x2:
      case 0x3:
        switch(low) {
          case 0x1: // LD n, nn --- 16 bit load nn into n
            opcode_ld.LD_nnn(high);
            break;
          case 0xA: // LD A, (BC)/(DE)/(HL+)/(HL-)
            if (high == 0x2) {             // increment
              opcode_methods.LD_A_regn(67);
              hardware.set_full_registers(6, hardware.get_full_registers(6) + 1);
            } else if (high == 0x3) {      // decrement
              opcode_methods.LD_A_regn(67);
              hardware.set_full_registers(6, hardware.get_full_registers(6) - 1);
            } else if (high == 0x1) {
              opcode_methods.LD_A_regn(45);
            } else {
              opcode_methods.LD_A_regn(23);
            }
            hardware.cpu_registers[9] += 1;
            break;
          case 0x4: // INC B,D,H,HL
          case 0xC: // INC C,E,L,A
            opcode_arithmetic.inc8bit(opcode);
            hardware.cpu_registers[9] += 1;
            break;

          case 0x6: // LD B, D, H, (HL)
          case 0xE: // LD C, E, L, A
            opcode_ld.LD_nn_n();
            break;

          default:
            opcode_map.get(opcode)();
        }
        break;

      case 0x4:
      case 0x5:
      case 0x6:
        opcode_ld_r1r2.compute(low)(high);
        hardware.cpu_registers[9] += 1;
        break;

      case 0x7:
        if (low == 6) {
          // NOT FULLY IMPLEMENTED (requires interrupts)
          __halt = true;
        } else {
          opcode_ld_r1r2.compute(low)(high);
        }
        hardware.cpu_registers[9] += 1;
        break;

      case 0x8:
        if (low < 0x8) {
          opcode_arithmetic.add_An(low);
        } else {
          opcode_arithmetic.adc_An(low);
        }
        hardware.cpu_registers[9] += 1;
        break;


      case 0xC:
      case 0xD:
      case 0xE:
      case 0xF:
        switch(low) {
          case 0x5: // PUSH BC, DE, HL, AF
            opcode_call.push(high);
            break;

          default:
            opcode_map.get(opcode)();
        }
        break;


      default:
        opcode_map.get(opcode)();
    }
  };

  const start = function() {
    while (true) {
      console.log(hardware.cpu_registers[9].toString(16) + " > " + 
        hardware.memory[hardware.cpu_registers[9]].toString(16));
      decode_opcode(hardware.memory[hardware.cpu_registers[9]]);
      if (__halt) {
        break;
      }
    }
  };

  //load_game();

})();
