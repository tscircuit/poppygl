import { expect, test } from "bun:test"
import {
  base64ToUint8Array,
  concatUint8Arrays,
  toUint8Array,
  uint8ArrayToNodeBuffer,
} from "../../lib/utils/bytes"

test("concatUint8Arrays combines chunks into a Uint8Array", () => {
  const bytes = concatUint8Arrays([new Uint8Array([1, 2]), new Uint8Array([3])])

  expect(bytes).toBeInstanceOf(Uint8Array)
  expect(Array.from(bytes)).toEqual([1, 2, 3])
})

test("toUint8Array preserves sliced view ranges", () => {
  const backing = new Uint8Array([9, 1, 2, 8])
  const bytes = toUint8Array(backing.subarray(1, 3))

  expect(bytes).toBeInstanceOf(Uint8Array)
  expect(Array.from(bytes)).toEqual([1, 2])
})

test("base64ToUint8Array decodes exact bytes", () => {
  const bytes = base64ToUint8Array("AQID")

  expect(bytes).toBeInstanceOf(Uint8Array)
  expect(Array.from(bytes)).toEqual([1, 2, 3])
})

test("uint8ArrayToNodeBuffer returns a real Node Buffer", () => {
  const bytes = uint8ArrayToNodeBuffer(new Uint8Array([1, 2, 3]))

  expect(Buffer.isBuffer(bytes)).toBe(true)
  expect(Array.from(bytes)).toEqual([1, 2, 3])
})
