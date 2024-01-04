import type { DirectoryMetadata, FileMetadata } from './types'

export const isDirectory = (val: any) => !!val && !(val instanceof ArrayBuffer || ('length' in val && typeof val.length === 'number')) && typeof val === 'object' && !Array.isArray(val)

export const isDirectoryMetadata =
  (val: DirectoryMetadata | FileMetadata): val is DirectoryMetadata =>
    isDirectory(val) &&
    isDirectory((<DirectoryMetadata>val).files)
