
import type { UnpackedFiles, UnpackedDirectory, FileMetadata, DirectoryMetadata } from './types'

import { Path, Buffer } from 'filer'
import { Encoder } from '@msgpack/msgpack'

import { createEmpty } from './pickle'
import { isDirectory, isDirectoryMetadata } from './utils'

const path = Path
const encoder = new Encoder();

const makeFlatTree = (files: UnpackedFiles): UnpackedFiles => {
  const tree: UnpackedFiles = {}

  for (const [key, val] of Object.entries(files)) {
    let currDir = tree
    const dirs = key.split(path.sep).filter(Boolean)
    const filename = <string>dirs.pop()
    for (const dir of dirs) {
      currDir = <UnpackedFiles>(currDir[dir] = currDir[dir] ?? {})
    }
    currDir[filename] = val
  }
  return <UnpackedDirectory>tree
}

const makeHeaderTree = (files: UnpackedFiles): UnpackedDirectory =>
  Object
    .entries(files)
    .reduce(({ files }, [key, value]) => ({
      files: {
        ...files,
        [key]:
          isDirectory(value)
            ? makeHeaderTree(<UnpackedFiles>value)
            : value
      }
    }), { files: {} })

const makeSizeTree = (tree: UnpackedDirectory): DirectoryMetadata =>
  Object
    .entries(tree.files)
    .reduce(({ files }, [key, value]) => ({
      files: {
        ...files,
        [key]:
          isDirectoryMetadata(value as any)
            ? makeSizeTree(<UnpackedDirectory>value)
            : { size: (<any>value)?.length }
      }
    }), { files: {} })

const makeOffsetTree = (tree: DirectoryMetadata): DirectoryMetadata => {
  const makeInnerOffsetTree = (tree: DirectoryMetadata, offset: number): [DirectoryMetadata, number] => {
    for (const [key, value] of Object.entries(tree.files)) {
      if (isDirectoryMetadata(value)) {
        const [newValue, newOffset] = makeInnerOffsetTree(<DirectoryMetadata>value, offset)
        tree.files[key] = newValue
        offset = newOffset
      } else {
        tree.files[key] = { size: (<FileMetadata>value).size || 0, offset: offset }
        offset += (<FileMetadata>value).size || 0
      }
    }

    return [tree, offset]
  }

  return makeInnerOffsetTree(tree, 0)[0]
}

const makeHeader = (files: UnpackedFiles): DirectoryMetadata =>
  makeOffsetTree(
    makeSizeTree(
      makeHeaderTree(files)
    )
  )

const makeFilesBuffer = (files: UnpackedFiles): Buffer[] =>
  Object.entries(files)
    .reduce<Buffer[]>((arr, [, value]) => [
      ...arr,
      ...(
        isDirectory(value) ? makeFilesBuffer(<UnpackedFiles>value)
          : [Buffer.from(value as any)]
      )
    ], [])

export const createPackage = async (files: UnpackedFiles, { flat = false } = {}): Promise<Buffer> => {
  const header = makeHeader(flat ? makeFlatTree(files) : files)
  // const headerPickle = createEmpty()
  // headerPickle.writeString(JSON.stringify(header))
  // const headerBuf = headerPickle.toBuffer()

  const headerPickle = createEmpty();
  const headerData = encoder.encode(header);
  headerPickle.writeInt(headerData.length);
  headerPickle.writeBytes(headerData, headerData.length);
  const headerBuf = headerPickle.toBuffer();

  const sizePickle = createEmpty()
  sizePickle.writeUInt32(headerBuf.length)
  const sizeBuf = sizePickle.toBuffer()
  return Buffer.concat([sizeBuf, headerBuf, ...makeFilesBuffer(files)])
}
