/* Verbatim color sequences from Fiberfinder-backup/index.html. Never reorder without source validation. */
export interface FiberColor {name:string;css:string;dark:boolean;clear?:boolean;}
export const C: Record<string,FiberColor> = {
      White:     { name: "White",     css: "#ffffff", dark: true },
      Red:       { name: "Red",       css: "#ff1f1f", dark: false },
      Yellow:    { name: "Yellow",    css: "#ffe316", dark: true },
      Green:     { name: "Green",     css: "#00b85a", dark: true },
      Blue:      { name: "Blue",      css: "#1187d1", dark: false },
      Gray:      { name: "Gray",      css: "#a5a5a5", dark: true },
      Brown:     { name: "Brown",     css: "#8a431c", dark: false },
      Black:     { name: "Black",     css: "#080a0d", dark: false },
      Violet:    { name: "Violet",    css: "#7030a0", dark: false },
      Turquoise: { name: "Turquoise", css: "#61b7e9", dark: true },
      Orange:    { name: "Orange",    css: "#ffc000", dark: true },
      Pink:      { name: "Pink",      css: "#ff49c8", dark: true },
      Clear:     { name: "Clear",     css: "transparent", dark: true, clear: true },
      LightBlue: { name: "Light Blue", css: "#d6e8f7", dark: true },
      LightOrange:{ name: "Light Orange", css: "#f8cbad", dark: true },
      LightGreen:{ name: "Light Green", css: "#c6e0b4", dark: true }
    };

    // Order follows the supplied Excel color-code sheet.
    export const colorCodes: Record<string,FiberColor[]> = {
      "Telenor": [C.White,C.Red,C.Yellow,C.Green,C.Blue,C.Gray,C.Brown,C.Black,C.Violet,C.Turquoise,C.Orange,C.Pink],
      "OPGW / TIA-598": [C.Blue,C.Orange,C.Green,C.Brown,C.Gray,C.White,C.Red,C.Black,C.Yellow,C.Violet,C.Pink,C.Turquoise],
      "Skanove S12": [C.Red,C.Blue,C.White,C.Green,C.Yellow,C.Gray,C.Brown,C.Black,C.Violet,C.Orange,C.Turquoise,C.Pink],
      "Nittedal": [C.Red,C.Green,C.Blue,C.Yellow,C.White,C.Gray,C.Brown,C.Violet,C.Black,C.Turquoise,C.Orange,C.Pink],
      "Gammel Telenor": [C.Black,C.Brown,C.Red,C.Orange,C.Yellow,C.Green,C.Blue,C.Violet,C.Gray,C.White,C.Pink,C.Turquoise],
      "Gammel Telenor 8": [C.White,C.Brown,C.Red,C.Orange,C.Yellow,C.Green,C.Blue,C.Violet],
      "Nettpartner G12": [C.Black,C.White,C.Green,C.Red,C.Brown,C.Blue,C.Orange,C.Yellow,C.Violet,C.Gray,C.Pink,C.Clear],
      "Nettpartner G8": [C.Black,C.Brown,C.Red,C.Orange,C.Yellow,C.Green,C.Blue,C.Violet],
      "Nettpartner Draka G8": [C.Blue,C.Yellow,C.Red,C.White,C.Green,C.Violet,C.Orange,C.Gray],
      "Nettpartner QXAI 8": [C.Red,C.Green,C.Blue,C.Yellow,C.White,C.Gray,C.Brown,C.Violet],
      "PRIORITY / IP-ONLY": [C.Red,C.Green,C.Blue,C.Yellow,C.White,C.Gray,C.Brown,C.Violet,C.Turquoise,C.Black,C.Orange,C.Pink],
      "PRIORITY GAMMEL": [C.Red,C.Green,C.Yellow,C.Blue,C.White,C.Violet,C.Orange,C.Black,C.Gray,C.Brown,C.Pink,C.Turquoise],
      "PT8": [C.Red,C.Green,C.Blue,C.Yellow,C.White,C.Gray,C.Brown,C.Black],
      "Østfold Fibernett": [C.Red,C.Blue,C.White,C.Green,C.Yellow,C.Gray,C.Orange,C.Brown,C.Violet,C.Black,C.Pink,C.Turquoise],
      "Sogn Network": [C.Red,C.Blue,C.White,C.Green,C.Yellow,C.Gray,C.Brown,C.Black],
      "BLÅ BBS": [C.Red,C.White,C.Yellow,C.White,C.Yellow,C.White,C.Yellow,C.White,C.Yellow,C.White,C.Yellow,C.Blue],
      "BBS 12F": [C.Red,C.White,C.Yellow,C.Blue,C.Green,C.Violet,C.Brown,C.Black,C.Orange,C.Turquoise,C.Pink,C.Gray],
      "BBS 8F": [C.Red,C.White,C.Yellow,C.Blue,C.Green,C.Violet,C.Brown,C.Black],
      "BBS 6F": [C.Blue,C.Orange,C.Green,C.Brown,C.Gray,C.Red],
      "OPGW 16F — V1": [C.Blue,C.Orange,C.Green,C.Brown,C.Gray,C.White,C.Red,C.Black,C.Yellow,C.Violet,C.Pink,C.Turquoise,C.Clear,C.Turquoise,C.Yellow,C.Violet],
      "OPGW 16F — V2": [C.Blue,C.Orange,C.Green,C.Brown,C.Gray,C.White,C.Red,C.Black,C.Yellow,C.Violet,C.Pink,C.Turquoise,C.Yellow,C.Clear,C.Green,C.Violet],
      "OPGW 16F — V3": [C.Blue,C.Orange,C.Green,C.Brown,C.Gray,C.White,C.Red,C.Black,C.Yellow,C.Violet,C.Pink,C.Turquoise,C.LightBlue,C.LightOrange,C.LightGreen,C.LightOrange]
    };

    
export const standard12ColorCodes = new Set([
      "Telenor",
      "OPGW / TIA-598",
      "Skanove S12",
      "Nittedal",
      "Gammel Telenor",
      "PRIORITY / IP-ONLY",
      "PRIORITY GAMMEL",
      "Østfold Fibernett",
      "BBS 12F"
    ]);

    
export const tubeSizes = [1,2,4,6,8,12,16,24];
export interface FiberResult {fiber:number;tube:number;position:number;first:number;last:number;striped:boolean;displayColor:FiberColor;displayName:string;}
export function lookupFibers(codeName:string, perTube:number, input:string): {rows:FiberResult[]; error:string} {
 const sequence=colorCodes[codeName];
 if(!sequence) return {rows:[],error:'Velg en gyldig fargekode.'};
 const standard=standard12ColorCodes.has(codeName);
 if(!tubeSizes.includes(perTube) || (!standard && perTube!==sequence.length)) return {rows:[],error:'Ugyldig antall fibre per rør.'};
 const raw=input.trim();
 if(!raw || !/^\d+(?:\s*,\s*\d+)*$/.test(raw)) return {rows:[],error:'Oppgi fibernummer, eventuelt flere atskilt med komma (13,14).'};
 const nums=raw.split(',').map(s=>Number(s.trim()));
 if(nums.some(n=>!Number.isSafeInteger(n)||n<1)) return {rows:[],error:'Fibernummer må være positive heltall.'};
 const rows=nums.map(fiber=>{
   const tube=Math.floor((fiber-1)/perTube)+1;
   const position=((fiber-1)%perTube)+1;
   const striped=standard && position>12;
   const color=sequence[standard ? (position-1)%12 : position-1];
   const blankStripedBlack=striped&&color.name==='Black';
   const displayColor=blankStripedBlack?C['White']:color;
   const displayName=blankStripedBlack?'BLANK ///':striped?color.name.toUpperCase()+' ///':color.name.toUpperCase();
   return {fiber,tube,position,first:(tube-1)*perTube+1,last:tube*perTube,striped,displayColor,displayName};
 });
 return {rows,error:''};
}
