# diff-to-index
Convert a diff blocks ([flitbit/diff](https://github.com/flitbit/diff)) from a data model to updates on an index, such as an ElasticSearch database.

Given a configuration of the indexes to build, the library will generate operations. These operations can be converted to REST calls to the DB.

