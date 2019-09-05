# diff-to-index
Converts a list of diff blocks ([flitbit/diff](https://github.com/flitbit/diff)) from a data model to updates on an index, such as an ElasticSearch database.

Given a configuration of the indexes to build, the library will generate operations. These operations can be converted to REST calls to the DB.

## Get started

```
npm install diff-to-index
```
