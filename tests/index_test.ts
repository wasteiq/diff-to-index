import {should} from 'chai'
import { createIndexChanges, IIndexConfig } from '../index';
import { diff } from 'deep-diff';
import { Iterable } from '@reactivex/ix-es5-cjs';

should()

describe("index", () => {
	// Variants: when the item is null (needed when sorting - use "NULL")
	(["add records", "modify records"] as const).forEach(variant =>
	it(`should ${variant}`, () => {
		const items = variant === "add records" ? {} : {pk: {name: "hallo", otherThings: "bad"}}
		const newItems = {pk: {name: "hei", otherThings: "bad"}}

		const diffie = Iterable.from(diff(items, newItems) || [])

		const config: IIndexConfig[] = [{
			collection: "horrors",
			index: "horror_name",
			path: ["name"]
		}, {
			collection: "cannibals",
			index: "other_index",
			path: ["otherThings"]
		}]

		const result = createIndexChanges("horrors", diffie, config)

		result.should.have.length(1)
		result.should.deep.equal([{
			type: variant === "add records" ? "ADD" : "UPDATE",
			pk: "pk",
			index: "horror_name",
			columns: {name: "hei"},
		}])
	}))

	// Variants goes here, add, remove, replace
	it("should deal with arrays adds in arrays", () => {

	})
})