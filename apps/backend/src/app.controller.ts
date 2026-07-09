import { Controller, Get } from '@nestjs/common';
import { Ok } from './common/response';

/**
 * 根 controller — health / version / live watch 走这里。
 * Auth / market 等业务 controller 各自挂载在 api/* 前缀下。
 */
@Controller()
export class AppController {
  @Get()
  root() {
    return Ok({
      name: 'Stock-Double Play Backend',
      version: '0.1.0',
      time: new Date().toISOString(),
      ws: '/game',
    });
  }

  @Get('health')
  health() {
    return Ok({ status: 'ok', uptime: process.uptime() });
  }
}
