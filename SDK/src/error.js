
export const ErrorCodes=Object.freeze({ //used freez because so npbody can change,update and delete on runtime
  NOT_FOUND:'NOT_FOUND',
  INVALID_NAME: 'INVALID_NAME',                 // empty, too long, contains "/" ...
  DUPLICATE_NAME: 'DUPLICATE_NAME',             // same name already in that folder
  PARENT_NOT_FOLDER: 'PARENT_NOT_FOLDER',       // tried to put something inside a file
  MOVE_INTO_DESCENDANT: 'MOVE_INTO_DESCENDANT', // folder moved into itself or a child
  CANNOT_MODIFY_ROOT: 'CANNOT_MODIFY_ROOT',     // rename/move/delete on "My Files"
  NO_CHANGE: 'NO_CHANGE',                       // rename to same name, move to same folder
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',         // wrong type of input to a method
  INVALID_SEARCH_OPTIONS: 'INVALID_SEARCH_OPTIONS',
  TRANSACTION_CLOSED: 'TRANSACTION_CLOSED',     // tx used after it finished
  TRANSACTION_ASYNC: 'TRANSACTION_ASYNC',       // async function in a transaction
})


export class FileExplorerError extends Error {
  constructor(code, message, details) {
    super(message)               // sets error.message
    this.name = 'FileExplorerError'
    this.code = code
    if (details !== undefined) this.details = details // optional extra info like id 
  }
}
