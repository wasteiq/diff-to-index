import {should} from 'chai'
import { createIndexChanges, IIndexConfig, findItems } from '../index';
import { diff } from 'deep-diff';
import { Iterable } from '@reactivex/ix-es5-cjs';

should()

describe("index", () => {
	// Variants: when the item is null (needed when sorting - use "NULL")
	(["add records", "modify records", "delete records", "add records with null value"] as const).forEach(variant =>
	(["simple index", "multi level index"] as const).forEach(indexComplexity =>
	it(`should ${variant}, ${indexComplexity}`, () => {
		const blockBuilder = (name: string) => indexComplexity === "simple index" ? ({name}) : ({complex: {name}})
		const items = variant === "modify records" ? {pk: {...blockBuilder("hallo"), otherThings: "bad"}} : {}
		const newItems = {pk: variant === "add records with null value" ?
			{this_one: "got no name"} :
			{...blockBuilder("hei"), otherThings: "bad"}}

		const diffie = Iterable.from(diff(...(<[any, any]>(variant === "delete records" ?
						[newItems, items] :
						[items, newItems]))) || [])

		const config: IIndexConfig[] = [{
			collection: "horrors",
			index: "horror_name",
			path: indexComplexity === "simple index" ? ["name"] : ["complex", "name"]
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
	})));

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
	}));

	(["adds", "delete"] as const).forEach(variant =>
	it(`should deal with ${variant} in objects containing arrays`, () => {
		const items = {}
		const newItems = {pok: {points: [{pri: 1, point: "fff"}, {pri: 3, point: "xyz"}]}}

		const diffie = Iterable.from((variant === "adds" ? diff<Partial<typeof newItems>>(items, newItems) : diff(newItems, items)) || [])

		const config: IIndexConfig[] = [{
			collection: "horrors",
			index: "points_pri",
			path: ["points", "*", "pri"],
		}]

		const result = createIndexChanges("horrors", diffie, config)

		//  Two ways to resolve adds:
		//    * do a new diff of the new object, with an empty array substituting the actual array (hard to build this artifical object)
		//    * do a query instead of value to find all the items matching (the star), then create one for each

		result.should.deep.equal(variant === "adds" ? [{
			type: "ADD",
			pk: "pok",
			index: "points_pri",
			arrayIdx: 0,
			columns: {pri: 1},
		}, {
			type: "ADD",
			pk: "pok",
			index: "points_pri",
			arrayIdx: 1,
			columns: {pri: 3},
		}] : variant === "delete" ? [{
			// NB: All arrayIdx entries on PK must be deleted when there is no arrayIdx present
			type: "DELETE",
			pk: "pok",
			index: "points_pri",
		}] : [])
	}));
})


describe("findItems	", () => {
	// Variants: when the item is null (needed when sorting - use "NULL")
	it(`should find item from current path`, () => {
		const item = {a: {ho: 10}}
		const result = findItems(["x"], ["x", "a", "ho"], item)
		result.should.deep.equal([{value: 10}])
	})

	it(`should result in [null] when no item is found`, () => {
		const item = {a: {plo: 10}}
		const result = findItems(["x"], ["x", "a", "ho"], item)
		result.should.deep.equal([{value: null}])
	})

	it(`should find all items in array`, () => {
		const item = {a: {ho: [10, 20, {thing: 30}]}}
		const result = findItems(["x"], ["x", "a", "ho", "*"], item)
		result.should.deep.equal([{value: 10, idx: 0}, {value: 20, idx: 1}, {value: {thing: 30}, idx: 2}])
	})

	it(`should recurse into array item, when asked to`, () => {
		const item = {a: {ho: [{thing: 10}, {nothing: 20}, {thing: 30}]}}
		const result = findItems(["x"], ["x", "a", "ho", "*", "thing"], item)
		result.should.deep.equal([
			{value: 10, idx: 0},
			{value: null, idx: 1}, // No entry found here, so just returns [null]
			{value: 30, idx: 2}
		])
	})

	it(`should recurse into array item, event multiple nested, perhaps crazy deep`, () => {
		const item = {
			a: {
				ho: [
					{thing: [
						{homeOfInsane: "galehus"}]},
					{nothing: 20},
					{thing: [
						{homeOfInsane: "insanitus"},
						{homeOfInsane: "ballaleika"}]}
			]}}
		const result = findItems(["x"], ["x", "a", "ho", "*", "thing", "*", "homeOfInsane"], item)
		result.should.deep.equal([
			{value: "galehus", idx: 0},
			{value: null, idx: 1},
			{value: "insanitus", idx: 2},
			{value: "ballaleika", idx: 3}]) // This is basically the wrong index for this latest item, should probably also be 2
	})
})