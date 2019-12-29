import {Diff, DiffNew, DiffDeleted} from 'deep-diff'
import {Iterable} from '@reactivex/ix-es5-cjs'
import {Some, Maybe} from 'monet'
import {query as jpValueQuery} from 'jsonpath'
import { flatMap } from '@reactivex/ix-es5-cjs/iterable/pipe/index';

export const letsMakeThisAnExample = (a: string) => `hello ${a}`

type IArrayIndex = {
	/** The index in the array, if the update is inside an array */
	arrayIdx: number
}
type IPK = {pk: string}
export type IChangeAddOrUpdate = IPK & {
		type: "ADD" | "UPDATE",
		/** The touched values, typically the index configuration and data will make this an object with a single value.
		 * See diff-to-index unit tests for examples. */
		columns: {[index: string]: any}
	} & Partial<IArrayIndex>
export type IChangeDelete = IPK & {type: "DELETE",
	/** `true` if the entire array is wiped */
	allArrayIndices?: true} & Partial<IArrayIndex>
type IChangeAddOrUpdateOrDelete = IChangeAddOrUpdate | IChangeDelete
export type IChange = IChangeAddOrUpdateOrDelete & {index: string}

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

const remainingPath = (pathA: any[], pathB: any[]) =>
	Some(pathB.slice(pathA.length))

const areThereArraysDownTheLine = (pathA: any[], pathB: any[]) =>
	remainingPath(pathA, pathB).
		map(rem => rem.includes("*")).
		orSome(false)

/** Returns a jsonQuery for the part of `pathB` that are remaining after
 * pathA has been subtracted (assumed to be selected already).
 *
 * Stops at the first star, and returns the path so far, as the client is assumed to resolve arrays before continuing.
 */
const remainingPathToQuery = (pathA: any[], pathB: any[]) =>
	remainingPath(pathA, pathB).
		map(remaining => remaining.slice(0, Some(remaining.indexOf("*")).map(idx => idx === -1 ? {} : {i: idx + 1}).some().i)).
		map(remaining => ({
			query: Maybe.fromFalsy(remaining.length ? true : false).
					map(() => `$.${remaining.join(".")}`).
					orSome("$"),
			remaining,
		})).some()

const addOrEditKinds: Diff<any>["kind"][] = ["N", "E"]
const deleteKinds: Diff<any>["kind"][] = ["D"]

/** Search for items given `indexPath`, resolves multiple items
 * it the path includes the array wildcard (*).
 */
export const findItems = (diffPath: any[], indexPath: any[], obj: Object): {value: any, idx?: number}[] => Some(remainingPathToQuery(diffPath, indexPath)).
		map(({query, remaining}) => ({
			values: Maybe.fromFalsy(query !== "$" && query).
				flatMap(() => Some(jpValueQuery(obj, query)).
					flatMap(values => Maybe.fromFalsy(<any[]><any>values.length && values)).
					map(values => values.map(value => ({value}))).
					catchMap(() => Some([{value: null}]))).
				orSome([{value: obj}]),
			remaining,
		})).map(({values, remaining}) => ({
			values,
			currentPath: [...diffPath, ...remaining]
		})).map(({values, currentPath}) => ({
			values: currentPath.length === indexPath.length ? values :
				[...Iterable.from(values).pipe(
					flatMap(({value}) => value ? findItems(currentPath, indexPath, value) : [{value}]))],
			currentIsArray: currentPath[currentPath.length - 1] === "*",
		})).map(({values, currentIsArray}) =>
			currentIsArray ? values.map((x, i) => ({...x, idx: i})) : values).
		some()

const joinAndFilter = (diffs: Iterable<Diff<any>>, appIndices: IIndexConfig[]): Iterable<IChange[][]> =>
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
							arrayIdx: Maybe.fromUndefined(Iterable.from(corePath).reverse().filter(x => typeof x === "number").map(x => <number>x).first()).orSome(-1),
							path: corePath,
						})
					})).
					some()).
				map(({diff, pk, path: diffPath, arrayIdx}) =>
					appIndices.
						map(({path: indexPath, index}) =>
							Maybe.fromFalsy(addOrEditKinds.includes(diff.kind) && inPath(diffPath, indexPath) && {
									columnKey: Maybe.fromUndefined(Iterable.from(indexPath).filter(x => x !== "*").last()).orSome("UNKNOWN"),
									index,
									diff: <DiffNew<any>>diff} || null).
							map(values => ({
								...values,
								hits: findItems(diffPath, indexPath, values.diff.rhs)
							})).
							map<IChangeAddOrUpdateOrDelete[]>(({columnKey, diff, hits}) => hits.
								map(({value, idx}) => <IChangeAddOrUpdate>{
									type: diff.kind === "N" ? "ADD" : "UPDATE",
									pk,
									columns: {
										[columnKey]: value,
									},
									...(arrayIdx > -1 ? {arrayIdx} : typeof idx === "number" ? <IArrayIndex>{arrayIdx: idx} : null),
								})
							).
							catchMap(() => Maybe.fromFalsy(deleteKinds.includes(diff.kind) && inPath(diffPath, indexPath) &&
												{
													indexPath,
													index,
													diff: <DiffDeleted<any>>diff
												} || null).
									map(() => [<IChangeDelete>{
										// Note: If path is longer than just the PK, this might actually be an update of the field, to `null`
										type: "DELETE",
										pk,
										...(areThereArraysDownTheLine(diffPath, indexPath) ? {allArrayIndices: true} : {}),
										...(arrayIdx > -1 ? <IArrayIndex>{arrayIdx} : null),
									}])
								).
							map(things => things.map(thing => (<IChange>{...thing, index}))).
							orSome([])
						)).
				some())


export const createIndexChanges = (collection: string, diffs: Iterable<Diff<any>>, indices: IIndexConfig[]): IChange[] =>
	Some(indices.filter(x => x.collection === collection)).
		filter(appIndices => appIndices.length ? true : false).
		map(appIndices =>
			[...joinAndFilter(diffs, appIndices).
				flatMap(x => x).
				flatMap(x => x)]
		).
		orSome([])