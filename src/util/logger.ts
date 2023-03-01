// from: https://github.com/svsool/memo/blob/master/src/logger.ts
import { window } from 'vscode';
import util from 'util';
import { getConfigProperty } from '../config';



const LVL: Record<string, number> = {
  'none': 6,
  // 'fatal: ,
  'error': 5,
  'warn': 4,
  'info': 3,
  'debug': 2,
  // 'trace': ,
  'verbose': 1,
};

export const logger = window.createOutputChannel('WikiBonsai');

const log = (level: string) => (...params: (string | object | unknown)[]) => {
  const configlvl: string = getConfigProperty('wikibonsai.log.level', 'info');
  if (LVL[level] >= LVL[configlvl]) {
    logger.appendLine(
      `[${new Date().toISOString()}] [${level}] ${params
        .map((param) => (typeof param === 'string' ? param : util.inspect(param)))
        .join(' ')}`,
    );
  }
};

// const fatal = log('fatal');

const error = log('error');

const warn = log('warn');

const info = log('info');

const debug = log('debug');

// const trace = log('trace');

const verbose = log('verbose');

export default { info, debug, verbose, warn, error, logger };
