const hardware = {
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

  stack: [],

  init: function() {
    canvas_el = document.getElementById("gamewindow");
    canvas_el.width = 160 * 3;
    canvas_el.height = 144 * 3;
    this.canvas_ctx = canvas_el.getContext("2d");
  }

};


