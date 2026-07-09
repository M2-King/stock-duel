import { Controller, Get, Param } from '@nestjs/common';
import { ReplayService } from './replay.service';
import { Ok } from '../common/response';

@Controller('replay')
export class ReplayController {
  constructor(private readonly replay: ReplayService) {}

  @Get()
  async list() {
    return this.replay.list();
  }

  @Get(':matchId')
  async load(@Param('matchId') matchId: string) {
    return this.replay.load(matchId);
  }
}
