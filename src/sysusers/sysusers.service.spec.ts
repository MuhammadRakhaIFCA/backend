import { Test, TestingModule } from '@nestjs/testing';
import { SysusersService } from './sysusers.service';

describe('SysusersService', () => {
  let service: SysusersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SysusersService],
    }).compile();

    service = module.get<SysusersService>(SysusersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
