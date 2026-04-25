import { inflateRawSync } from "node:zlib";

export type ImportedUserRow = {
  rowNumber: number;
  username: string;
  password: string;
  role: "SUPER_ADMIN" | "ADMIN" | "USER";
  groupName: string | null;
};

type ZipEntry = { name: string; compression: number; compressedSize: number; uncompressedSize: number; dataOffset: number };

const textDecoder = new TextDecoder("utf-8");
const roleAliases = new Map<string, ImportedUserRow["role"]>([
  ["SUPER_ADMIN", "SUPER_ADMIN"],
  ["超级管理员", "SUPER_ADMIN"],
  ["ADMIN", "ADMIN"],
  ["管理员", "ADMIN"],
  ["USER", "USER"],
  ["用户", "USER"],
  ["学生", "USER"],
]);

function readUInt16(buffer: Uint8Array, offset: number) {
  return buffer[offset] | (buffer[offset + 1] << 8);
}

function readUInt32(buffer: Uint8Array, offset: number) {
  return (buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16) | (buffer[offset + 3] << 24)) >>> 0;
}

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function getZipEntries(buffer: Uint8Array) {
  let endOffset = -1;
  for (let index = buffer.length - 22; index >= Math.max(0, buffer.length - 66000); index--) {
    if (readUInt32(buffer, index) === 0x06054b50) {
      endOffset = index;
      break;
    }
  }
  if (endOffset < 0) throw new Error("不是有效的 xlsx 文件");
  const entryCount = readUInt16(buffer, endOffset + 10);
  let offset = readUInt32(buffer, endOffset + 16);
  const entries = new Map<string, ZipEntry>();

  for (let index = 0; index < entryCount; index++) {
    if (readUInt32(buffer, offset) !== 0x02014b50) throw new Error("xlsx 中央目录损坏");
    const compression = readUInt16(buffer, offset + 10);
    const compressedSize = readUInt32(buffer, offset + 20);
    const uncompressedSize = readUInt32(buffer, offset + 24);
    const nameLength = readUInt16(buffer, offset + 28);
    const extraLength = readUInt16(buffer, offset + 30);
    const commentLength = readUInt16(buffer, offset + 32);
    const localHeaderOffset = readUInt32(buffer, offset + 42);
    const name = textDecoder.decode(buffer.subarray(offset + 46, offset + 46 + nameLength));
    const localNameLength = readUInt16(buffer, localHeaderOffset + 26);
    const localExtraLength = readUInt16(buffer, localHeaderOffset + 28);
    entries.set(name, { name, compression, compressedSize, uncompressedSize, dataOffset: localHeaderOffset + 30 + localNameLength + localExtraLength });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function readEntry(buffer: Uint8Array, entries: Map<string, ZipEntry>, name: string) {
  const entry = entries.get(name);
  if (!entry) return null;
  const data = buffer.subarray(entry.dataOffset, entry.dataOffset + entry.compressedSize);
  if (entry.compression === 0) return textDecoder.decode(data);
  if (entry.compression === 8) return inflateRawSync(data, { finishFlush: 2 }).toString("utf8");
  throw new Error(`不支持的 xlsx 压缩格式：${entry.compression}`);
}

function getFirstWorksheetPath(workbookXml: string, workbookRelsXml: string) {
  const sheetMatch = workbookXml.match(/<sheet\b[^>]*r:id="([^"]+)"[^>]*>/);
  if (!sheetMatch) throw new Error("xlsx 中没有工作表");
  const relationshipMatch = workbookRelsXml.match(new RegExp(`<Relationship[^>]*Id="${sheetMatch[1]}"[^>]*Target="([^"]+)"[^>]*/?>`));
  if (!relationshipMatch) throw new Error("无法定位第一个工作表");
  const target = relationshipMatch[1].replace(/^\//, "");
  return target.startsWith("xl/") ? target : `xl/${target}`;
}

function parseSharedStrings(xml: string | null) {
  if (!xml) return [];
  return Array.from(xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g), (match) =>
    decodeXml(Array.from(match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g), (textMatch) => textMatch[1]).join("")),
  );
}

function columnIndex(cellRef: string) {
  const letters = cellRef.replace(/[^A-Z]/gi, "").toUpperCase();
  let index = 0;
  for (const letter of letters) index = index * 26 + letter.charCodeAt(0) - 64;
  return index - 1;
}

function readCellValue(cellXml: string, sharedStrings: string[]) {
  const type = cellXml.match(/\bt="([^"]+)"/)?.[1];
  if (type === "inlineStr") return decodeXml(Array.from(cellXml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g), (match) => match[1]).join(""));
  const value = cellXml.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
  if (type === "s") return sharedStrings[Number(value)] ?? "";
  return decodeXml(value);
}

export function parseUsersXlsx(buffer: Uint8Array): ImportedUserRow[] {
  const entries = getZipEntries(buffer);
  const workbookXml = readEntry(buffer, entries, "xl/workbook.xml");
  const workbookRelsXml = readEntry(buffer, entries, "xl/_rels/workbook.xml.rels");
  if (!workbookXml || !workbookRelsXml) throw new Error("不是有效的 xlsx 文件");
  const sheetXml = readEntry(buffer, entries, getFirstWorksheetPath(workbookXml, workbookRelsXml));
  if (!sheetXml) throw new Error("无法读取第一个工作表");
  const sharedStrings = parseSharedStrings(readEntry(buffer, entries, "xl/sharedStrings.xml"));
  const rows = Array.from(sheetXml.matchAll(/<row\b[^>]*r="?(\d+)"?[^>]*>([\s\S]*?)<\/row>/g));

  return rows.flatMap((rowMatch) => {
    const rowNumber = Number(rowMatch[1]);
    const cells = ["", "", "", ""];
    for (const cellMatch of rowMatch[2].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const ref = cellMatch[1].match(/\br="([^"]+)"/)?.[1] ?? "";
      const index = columnIndex(ref);
      if (index >= 0 && index < cells.length) cells[index] = readCellValue(cellMatch[0], sharedStrings).trim();
    }
    if (cells.every((cell) => !cell)) return [];
    if (rowNumber === 1 && cells[0] === "用户名" && cells[1] === "初始密码" && cells[2] === "角色") return [];
    const role = roleAliases.get(cells[2].toUpperCase()) ?? roleAliases.get(cells[2]);
    if (!cells[0] || !cells[1] || !cells[2]) throw new Error(`第 ${rowNumber} 行缺少用户名、初始密码或角色`);
    if (cells[1].length < 4) throw new Error(`第 ${rowNumber} 行初始密码至少 4 位`);
    if (!role) throw new Error(`第 ${rowNumber} 行角色必须是 SUPER_ADMIN、ADMIN、USER 或对应中文名称`);
    if (role === "USER" && !cells[3]) throw new Error(`第 ${rowNumber} 行普通用户必须填写小组`);
    return [{ rowNumber, username: cells[0], password: cells[1], role, groupName: cells[3] || null }];
  });
}
