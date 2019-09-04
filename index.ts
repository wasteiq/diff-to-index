import {Diff, DiffNew, DiffDeleted} from 'deep-diff'
import {Iterable} from '@reactivex/ix-es5-cjs'
import {Some, Maybe} from 'monet'
import {value as jpValueQuery} from 'jsonpath'

export const letsMakeThisAnExample = (a: string) => `hello ${a}`


type IChangeAddOrUpdate = {type: "ADD" | "UPDATE", pk: string, columns: {[index: string]: any}}
type IChangeDelete = {type: "DELETE", pk: string}
type IChangeAddOrUpdateOrDelete = IChangeAddOrUpdate | IChangeDelete
type IChange = IChangeAddOrUpdateOrDelete & {index: string}

export interface IIndexConfig {
	collection: string
	index: string
	path: string[]
}

// arrays are a special form of add and update.
//   We can add an item with arrays in it - which would lead to lots of array entries being generated
//   We could have an update to an array entry
//   We could have an array entry removed

/** Wether `pathA` is part of `pathB`, where stars in `pathB` matches anything in `pathA` */
const inPath = (pathA: any[], pathB: any[]) => pathA.find((x, i) => (pathB.length <= i || (pathB[i] !== "*" && x !== pathB[i]))) ? false : true
// Must return multiple entries if the remaining path contains a star.  Or: Should replace the `value` thing with `query`
const remainingPathToQuery = (pathA: any[], pathB: any[]) =>
	Some(pathB.slice(pathA.length)).
		filter(x => x.length ? true : false).
		map(x => `$.${x.join(".")}`).
		orSome("$")

const addOrEditKinds: Diff<any>["kind"][] = ["N", "E"]
const deleteKinds: Diff<any>["kind"][] = ["D"]

const joinAndFilter = (diffs: Iterable<Diff<any>>, appIndices: IIndexConfig[]): Iterable<IChange[]> =>
	diffs.map(diff =>
			Some(({diff, path: Iterable.from(diff.path || [])})).
				map(({diff, path}) => Some([...path.skip(1)]).
					map(corePath => ({
						pk: path.first(),
						...(diff.kind === "A" ? {
							diff: diff.item,
							arrayIdx: diff.index,
							path: [...corePath, diff.index],
						} : {
							// Note: Might still be an array edit, if last part of the path is a number
							diff,
							arrayIdx: Maybe.fromUndefined(<number>corePath[corePath.length - 1]).filter(x => typeof x === "number").orSome(-1),
							path: corePath,
						})
					})).
					some()).
				map(({diff, pk, path: diffPath, arrayIdx}) =>
					appIndices.
						map(({path: indexPath, index}) =>
							Maybe.fromFalsy(addOrEditKinds.includes(diff.kind) && inPath(diffPath, indexPath) && {
									indexPath,
									columnKey: Maybe.fromUndefined(Iterable.from(indexPath).filter(x => x !== "*").last()).orSome("UNKNOWN"),
									index,
									diff: <DiffNew<any>>diff} || null).
							map<IChangeAddOrUpdateOrDelete>(({indexPath, columnKey, diff}) => <IChangeAddOrUpdate>{
									type: diff.kind === "N" ? "ADD" : "UPDATE",
									pk,
									columns: {
										[columnKey]: Some(remainingPathToQuery(diffPath, indexPath)).
											filter(query => query !== "$").
											flatMap(query => Maybe.
												fromUndefined(jpValueQuery(diff.rhs, query)).
												map(value => ({value})).
												catchMap(() => Some({value: null}))).
											orSome({value: diff.rhs}).value,
									},
									...(arrayIdx > -1 ? {arrayIdx} : {}),
								}
							).
							catchMap(() => Maybe.fromFalsy(deleteKinds.includes(diff.kind) && inPath(diffPath, indexPath) &&
												{
													indexPath,
													index,
													diff: <DiffDeleted<any>>diff
												} || null).
									map(() => <IChangeDelete>{
										// Note: If path is longer than just the PK, this might actually be an update of the field, to null
										type: "DELETE",
										pk,
										...(arrayIdx > -1 ? {arrayIdx} : {}),
									})
								).
							map(thing => <IChange>{...thing, index}).
							orSome(null as any)
						)).
				some())


export const createIndexChanges = (collection: string, diffs: Iterable<Diff<any>>, indices: IIndexConfig[]): IChange[] =>
	Some(indices.filter(x => x.collection === collection)).
		filter(appIndices => appIndices.length ? true : false).
		map(appIndices =>
			[...joinAndFilter(diffs, appIndices).flatMap(x => x)] // huge loss here as iterableX.flatten does not work nicely, typewise
		).
		orSome([])