import { Chess, QUEEN, BISHOP, KNIGHT, KING, WHITE, BLACK } from "chess.js"; // Import the Chess library for game logic
import { StructuredMove } from "./MoveHistory.js";  // The way we use moves

export class ChessPositionMove {
  constructor(move, score = 0, depth = 0, stockfishMessage = "") {
    this.move = move; // The StructuredMove object
    this.score = score; // associated score
    this.stockfishMessage = stockfishMessage; // full message
  }
}

export class ChessPositionMoves {
  /* Collects moves for a given position, so that a strategy can chose a move */
  constructor(positionFen) {
    this.moves = []; // Initialize an empty array to store moves
    this.fen = positionFen; // FEN of the board
  }

  // Method to add a move to the moves array
  addMove(chessPositionMove) {
    this.moves.push(chessPositionMove);
  }

  // Method to get a random move from the moves array
  getRandomMove() {
    const randomIndex = Math.floor(Math.random() * this.moves.length); // Generate a random index within the moves array
    return this.moves[randomIndex]; // Return the move at the random index
  }
}

export class BotStrategy {
  constructor(
    botName = "default",
    botSymbol = "🐉",
    useBestMove = true,
    depth = 20,
    selectFromTop = 3, // Select from top 3 moves
    whiteMoves = [], // Array to store white opening moves
    blackMoves = [], // Array to store black opening moves
    moveScoreDecline = 0.0, // Allow to reduce score per move by given value
    selectTopDecline = 0.0, // Select a move from the top N if their decline is not more than given
    moveScoreRatio = 1.0, // Select moves with score from the lower side of the range
    preferredPiece = [], // Letters of the move favorite pieces to move 
    timeUsage = 1.0, // Use lots of time, depending on how many good moves there are to pick [0.0, 1.0]
  ) {
    this.botName = botName;
    // Name of the bot
    this.botSymbol = botSymbol;
    // Symbol of the bot
    this.useBestMove = useBestMove;
    // Whether to use the best move or not
    this.depth = depth;
    // Depth of the search
    this.selectFromTop = selectFromTop;
    // Select from top N moves
    this.whiteMoves = whiteMoves;
    // Array to store white opening moves
    this.blackMoves = blackMoves;
    // Array to store black opening moves
    this.moveScoreDecline = moveScoreDecline;
    // Allow to reduce score per move by given value
    this.selectTopDecline = selectTopDecline;
    this.moveScoreRatio = moveScoreRatio;
    this.preferredPiece = preferredPiece;
    this.timeUsage = timeUsage;
  }

  // return a StructuredMove based on the available positionMoves
  selectMoveFromChessPositionMoves(positionMoves, bestMove, remainingTimeMS = 100000) {

    let moves = positionMoves.moves;
    console.debug("Selecting move via strategy ", this.botSymbol, " from ", moves.length, " moves with best move ", bestMove, " and FEN ", positionMoves.fen);

    let fen = positionMoves.fen
    let game = new Chess(fen);

    /* simple time calculation, as a start, take around 5 s per move */
    let takenTimeMS = 5432;
    if (remainingTimeMS > 0) {
      /* if we are low on time, have an extra chance to make quicker moves */
      if (takenTimeMS > remainingTimeMS) {
        if (Math.random() > this.timeUsage) {
          takenTimeMS = takenTimeMS * Math.random();
        }
      }
    }

    // select a move based on the given position moves
    if (this.useBestMove) {
      // If useBestMove is true, return the best move
      let returnmove = new StructuredMove(bestMove.slice(0, 2), bestMove.slice(2, 4), QUEEN, fen, takenTimeMS)
      console.debug("Return requested best move: ", returnmove)
      return returnmove
    }

    let bestScore = null;
    let worstScore = null;
    let moveNumber = game.moveNumber()
    for (const [i, chessPositionMove] of moves.entries()) {
      /* console.debug("Move ", i, " with move: ", chessPositionMove);*/
      let score = chessPositionMove.score;
      if (score === null) continue;
      if (chessPositionMove.depth < this.depth) continue;
      if (bestScore === null || score > bestScore) {
        bestScore = score;
      }
      if (worstScore === null || score < worstScore) {
        worstScore = score;
      }
    }

    /* console.debug("For move selection, best score: ", bestScore); */
    if (bestScore === null) {
      let returnmove = new StructuredMove(bestMove.slice(0, 2), bestMove.slice(2, 4), QUEEN, fen, takenTimeMS)
      console.debug("Return best move due to no found bestScore: ", returnmove)
      return returnmove
    }

    let acceptableMoveScore = bestScore - Math.min((moveNumber * this.moveScoreDecline), this.selectTopDecline)
    let acceptableMoveScoreDiff = (acceptableMoveScore - worstScore) * (1 - this.moveScoreRatio);
    acceptableMoveScore -= acceptableMoveScoreDiff;
    let acceptableMoves = []
    for (const [i, chessPositionMove] of moves.entries()) {
      let score = chessPositionMove.score;
      if (score === null) continue;
      if (score >= acceptableMoveScore) {
        acceptableMoves.push(chessPositionMove)
      }
    }

    // TODO: implement favorite opening moves
    let pickedMove = null;
    if (this.whiteMoves.length > 0 && game.turn() === WHITE) {
      console.debug("Selecting opening move for white from ", this.whiteMoves.length, " moves on move ", game.moveNumber());
      for (const [i, move] of this.whiteMoves.entries()) {
        for (const [j, chessPositionMove] of acceptableMoves.entries()) {
          if (move === chessPositionMove.move) {
            pickedMove = chessPositionMove;
            break
          }
        }
      }
    } else if (this.blackMoves.length > 0 && game.turn() === BLACK) {
      console.debug("Selecting opening move for black from ", this.blackMoves.length, " moves on move ", game.moveNumber());
      for (const [i, move] of this.blackMoves.entries()) {
        for (const [j, chessPositionMove] of acceptableMoves.entries()) {
          if (move === chessPositionMove.move) {
            pickedMove = chessPositionMove;
            break
          }
        }
      }
    }

    if (pickedMove !== null) {
      let returnmove = new StructuredMove(pickedMove.move.slice(0, 2), pickedMove.move.slice(2, 4), QUEEN, fen, takenTimeMS)
      console.debug("Return requested opening move: ", returnmove, " for playing in game state with turn ", game.turn())
      return returnmove
    }



    if (this.preferredPiece.length > 0) {
      let preferredMoves = [];
      // check given moves against preferred pieces
      for (const [i, piece] of this.preferredPiece.entries()) {
        for (const [j, chessPositionMove] of acceptableMoves.entries()) {
          let move = chessPositionMove.move;
          let fromSquare = move.slice(0, 2)
          let field = game.get(fromSquare)
          let movePiece = field.type;
          if (movePiece === piece) {
            preferredMoves.push(chessPositionMove);
          }
        }
        if (preferredMoves.length > 0) {
          break; // if we found a preferred move, stop searching
        }
      }
      if (preferredMoves.length > 0) {
        acceptableMoves = preferredMoves;
      }
    }

    // if acceptableMoves, randomly return a move
    let randomMove = undefined;
    let randomeScore = undefined;
    if (acceptableMoves.length > 0) {
      let randomIndex = Math.floor(Math.random() * acceptableMoves.length);
      randomIndex = randomIndex !== acceptableMoveScore.length ? randomIndex : randomIndex - 1;
      randomMove = acceptableMoves[randomIndex].move;
      randomeScore = acceptableMoves[randomIndex].score;
    }

    if (randomMove !== undefined && randomMove !== "") {
      console.debug("Selecting random move from ", acceptableMoves.length, " moves with score ", randomeScore, " vs best score: ", bestScore, ", namely: ", randomMove);
      let returnmove = new StructuredMove(randomMove.slice(0, 2), randomMove.slice(2, 4), "q", fen, takenTimeMS)
      console.debug("Return random selected move: ", returnmove)
      return returnmove
    } else {
      let returnmove = new StructuredMove(bestMove.slice(0, 2), bestMove.slice(2, 4), "q", fen, takenTimeMS)
      console.debug("Return fallback best move: ", returnmove)
      return returnmove
    }
  }
}

// Function to parse Stockfish's output and extract the best move and evaluation
export const parseStockfishMessage = (message, turn) => {

  /* example messages:
    info depth 2 seldepth 6 multipv 2 score mate -5 nodes 132 nps 132000 hashfull 2 time 1 pv h2h3 e2e3 g1g2
    info depth 1 seldepth 4 multipv 2 score cp 1272 nodes 143 nps 143000 hashfull 2 time 1 pv e2e3 f1f2
    bestmove d1f1 ponder e2e3
    info depth 16 seldepth 17 multipv 3 score cp 1236 nodes 51778 nps 325647 hashfull 23 time 159 pv f3g4 g1f2 e6f4 d1d6 f6g5 e2e5 f4h3 f2e1 g4g1 e1d2 g1h2 e5e2 h2d6 d2c1 d6f4 c1b2
  */

  // TODO: fix from https://github.com/bjedrzejewski/stockfish-js/blob/master/example/enginegame.js#L136
  let result = { bestMove: "", evaluation: "", pawnsScore: 0, move: "" }; // Initialize result with default values

  /*console.info("Received from stockfish: ", message) */

  // If the message starts with "bestmove", extract the best move from the message
  if (message.startsWith("bestmove")) {
    result.bestMove = message.split(" ")[1]; // The best move is the second word in the message
    result.move = result.bestMove;  // Store the best move in the 'move' property
  }

  // Check for "info score" in the message to extract evaluation score
  if (message.includes("info") && message.includes("score")) {
    const scoreParts = message.split(" "); // Split message into words
    const scoreIndex = scoreParts.indexOf("score") + 2; // "cp" or "mate" is two words after "score"

    // If the score type is "cp" (centipawn), interpret it as a material advantage in pawns
    if (scoreParts[scoreIndex - 1] === "cp") {
      let score = parseInt(scoreParts[scoreIndex], 10); // Parse the score value
      if (turn !== "b") {
        score = -score; // Invert the score if it's White's turn
      }
      result.evaluation = score / 100; // Convert centipawns to pawns
      result.pawnsScore = score / 100; // Store pawns score
    } else if (scoreParts[scoreIndex - 1] === "mate") {
      // If the score type is "mate", indicate moves until checkmate
      const mateIn = parseInt(scoreParts[scoreIndex], 10);
      result.evaluation = `Mate in ${Math.abs(mateIn)}`;
      result.pawnsScore = 50 - Math.abs(mateIn); // Store pawns score
    }

    let moveIndex = scoreParts.indexOf("pv") + 1;
    // Find the index of the "pv" (principal variation) keyword
    if (moveIndex > 0) {
      result.move = scoreParts[moveIndex]; // Store the first move in the principal variation
    }
  }

  return result; // Return the best move and evaluation
};


export const AVAILABLE_BOTS = [
  new BotStrategy("househorse", "🐎", false, 3, 20, ["e2e4","f2f4"], ["e7e6"], 2.0, 5.0, 0.1, [BISHOP]), // Chess bot strategy
  new BotStrategy("sauropod", "🦕", false, 7, 15, [], [], 2.0, 5.0, 0.1, [QUEEN]), // bad, move queen a lot
  new BotStrategy("chicken", "🐣", false, 4, 10, [], [], 2.0, 5.0, 0.2, [KNIGHT]),
  new BotStrategy("fly", "🪰", false, 3, 10, [], [], 2.0, 5.0, [KING, QUEEN]), // Fly bot strategy
  new BotStrategy("horse", "🐴", false, 10, 3, [], [], 1.0, 1.0, [KNIGHT]), // Stupid bot strategy
  new BotStrategy("dragon", "🐉", true, 20, 3, [], [], 1.0, 1.0), // Default bot strategy
  new BotStrategy("unicorn", "🦄", false, 15, 5, [], [], 1.0, 1.0), // Simple bot strategy
  new BotStrategy("lion", "🦁", false, 16, 4, [], [], 0.2, 0.2), // Lion bot strategy

]