
var hardware = {
  canvas_ctx: null,

  cpu_registers: [
    0, 0, // AF 0 1
    0, 0, // BE 2 3
    0, 0, // DE 4 5
    0, 0, // HL 6 7
    0,    // SP 8
    0     // PC 9
  ],
  /** F is as follows:
   * 7 6 5 4 3 2 1 0
   * Z N H C 0 0 0 0
   * */

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

var decrement_full_reg = function(n) {
  var fullvalue = (hardware.cpu_registers[n] << 8) + hardware.cpu_registers[n + 1];
  fullvalue -= 1;
  hardware.cpu_registers[n] = fullvalue >> 8;
  hardware.cpu_registers[n + 1] = fullvalue & 0xff;
}

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

var decode_opcode = function(opcode) {

  switch(opcode) {
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
          return 1;
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
      }
      hardware.cpu_registers[9] += 2 + n;
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

    case 0x32: // LD HL -, puts A into memory pointed to by HL and decrements HL
      hardware.memory[(hardware.cpu_registers[6] << 8) 
        + hardware.cpu_registers[7]] = hardware.cpu_registers[0];
      decrement_full_reg(6); // decrement HL
      hardware.cpu_registers[9] += 1;
      break;


    default:
      console.log("Unknown opcode: " + opcode.toString(16));
      return 1;
  }

}

var re;
var start = function(prog_data) {
  re = setInterval( function() {
    console.log(" > " + hardware.memory[hardware.cpu_registers[9]].toString(16));
    decode_opcode(hardware.memory[hardware.cpu_registers[9]]);
  }, 8 );
}

load_game();

