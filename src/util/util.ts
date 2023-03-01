// note: include emojis; sort by doctype then alpha-order
export function alphaSortLabels(a: any, b: any) {
  if(a.label < b.label) { return -1; }
  if(a.label > b.label) { return 1; }
  return 0;
}

// note: do not include emojis; only sort by alpha-order
// export function alphaSortLabels(a: any, b: any) {
//   if(a.label.substring(2) < b.label.substring(2)) { return -1; }
//   if(a.label.substring(2) > b.label.substring(2)) { return 1; }
//   return 0;
// }
