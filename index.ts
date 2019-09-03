import {Diff, DiffNew} from 'deep-diff'
import {Iterable} from '@reactivex/ix-es5-cjs'
import {Some} from 'monet'
import {value as jpValueQuery} from 'jsonpath'

export const letsMakeThisAnExample = (a: string) => `hello ${a}`


type IChangeAddOrUpdate = {type: "ADD" | "UPDATE", pk: string, columns: {[index: string]: any}}
type IChangeDelete = {type: "DELETE", pk: string}
type IChange = (IChangeAddOrUpdate | IChangeDelete) & {index: string}

export interface IIndexConfig {
	collection: string
	index: string
	path: string[]
}

const inPath = (pathA: any[], pathB: any[]) => pathB.length >= pathA.length ? pathA.find((x, i) => x !== pathB[i]) ? false : true : false
const remainingPathToQuery = (pathA: any[], pathB: any[]) =>
	Some(pathB.slice(pathA.length)).
		filter(x => x.length ? true : false).
		map(x => `$.${x.join(".")}`).
		orSome("$")

const addOrEditKinds: Diff<any>["kind"][] = ["N", "E"]

const joinAndFilter = (diffs: Iterable<Diff<any>>, appIndices: IIndexConfig[]): Iterable<IChange[]> =>
	diffs.map(diff =>
			Some(({diff, path: Iterable.from(diff.path || [])})).
				map(({diff, path}) => ({
					pk: path.first(),
					path: [...path.skip(1)],
					diff,
				})).
				map(({diff, pk, path: diffPath}) =>
					appIndices.
						filter(({path: indexPath}) => addOrEditKinds.includes(diff.kind) && inPath(diffPath, indexPath)).
						map(({path: indexPath, index}) => ({
							indexPath,
							index,
							key: indexPath[indexPath.length - 1],
							diff: <DiffNew<any>>diff,
						})).
						map(({indexPath, index, key, diff}) => (<IChange>{
							...<IChangeAddOrUpdate>{
								type: diff.kind === "N" ? "ADD" : "UPDATE",
								pk,
								columns: {
									[key]: Some(remainingPathToQuery(diffPath, indexPath)).
										filter(query => query !== "$").
										map(query => jpValueQuery(diff.rhs, query)).
										orSome(diff.rhs)
								}
							},
							...{
								index
							}
						}))).
				some())


export const createIndexChanges = (collection: string, diffs: Iterable<Diff<any>>, indices: IIndexConfig[]): IChange[] =>
	Some(indices.filter(x => x.collection === collection)).
		filter(appIndices => appIndices.length ? true : false).
		map(appIndices =>
			[...joinAndFilter(diffs, appIndices).flatMap(x => x)] // huge loss here as iterableX.flatten does not work nicely, typewise
		).
		orSome([])