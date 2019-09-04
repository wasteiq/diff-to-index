import {should} from 'chai'
import { createIndexChanges, IIndexConfig } from '../index';
import { diff } from 'deep-diff';
import { Iterable } from '@reactivex/ix-es5-cjs';

should()

describe("index", () => {
	// Variants: when the item is null (needed when sorting - use "NULL")
	(["add records", "modify records", "delete records", "add records with null value"] as const).forEach(variant =>
	it(`should ${variant}`, () => {
		const items = variant === "modify records" ? {pk: {name: "hallo", otherThings: "bad"}} : {}
		const newItems = {pk: variant === "add records with null value" ?
			{this_one: "got no name"} :
			{name: "hei", otherThings: "bad"}}

		const diffie = Iterable.from(diff(...(<[any, any]>(variant === "delete records" ?
						[newItems, items] :
						[items, newItems]))) || [])

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
		result.should.deep.equal([variant === "delete records" ? {
			type: "DELETE",
			pk: "pk",
			index: "horror_name"
		} : {
			type: variant === "modify records" ? "UPDATE" : "ADD",
			pk: "pk",
			index: "horror_name",
			columns: {name: variant === "add records with null value" ? null : "hei"},
		}])
	}));

	// Variants goes here, add, remove, replace
	(["adds", "replaces", "deletes"] as const).forEach(variant =>
	it(`should deal with ${variant} in simple arrays`, () => {
		const items = {pok: {things: ["10", "20"]}}
		const newItems = {pok: {things: ["10", ...(variant === "adds" ? ["20"] : []), ...(variant !== "deletes" ? ["30"] : [])]}}

		const diffie = Iterable.from(diff(items, newItems) || [])

		const config: IIndexConfig[] = [{
			collection: "horrors",
			index: "horror_name",
			path: ["things", "*"],
		}]

		const result = createIndexChanges("horrors", diffie, config)

		result.should.have.length(1)
		result.should.deep.equal([variant === "adds" ? {
			type: "ADD",
			pk: "pok",
			index: "horror_name",
			arrayIdx: 2,
			columns: {things: "30"},
		} : variant === "replaces" ? {
			type: "UPDATE",
			pk: "pok",
			index: "horror_name",
			arrayIdx: 1,
			columns: {things: "30"},
		} : {
			type: "DELETE",
			pk: "pok",
			index: "horror_name",
			arrayIdx: 1,
		}])
	}));

	(["adds", "updates", "delete"] as const).forEach(variant =>
		it(`should deal with ${variant} in complex arrays`, () => {
			const items = {pok: {points: [{pri: 1, point: "abc"}]}}
			// Note: an unrelated change is taking place here, point[0]: "abc" => "fff"
			const newItems = {pok: {points: [...(variant === "adds" ? [{pri: 1, point: "fff"}] : []),
				...(variant === "delete" ? [] : [{pri: 3, point: "xyz"}])]}}

			const diffie = Iterable.from(diff(items, newItems) || [])

			const config: IIndexConfig[] = [{
				collection: "horrors",
				index: "points_pri",
				path: ["points", "*", "pri"],
			}]

			const result = createIndexChanges("horrors", diffie, config)

			result.should.have.length(1)
			result.should.deep.equal([variant === "adds" ? {
				type: "ADD",
				pk: "pok",
				index: "points_pri",
				arrayIdx: 1,
				columns: {pri: 3},
			} : variant === "updates" ? {
				type: "UPDATE",
				pk: "pok",
				index: "points_pri",
				arrayIdx: 0,
				columns: {pri: 3},
			} : variant === "delete" ? {
				type: "DELETE",
				pk: "pok",
				index: "points_pri",
				arrayIdx: 0,
			} : {}])
		}))
})