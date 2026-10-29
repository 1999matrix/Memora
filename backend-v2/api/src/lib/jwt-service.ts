import jwt from 'jsonwebtoken';

type JwtSignInput = {
  secret: string;
  expiresIn?: string;
};

export class JwtService {
  signAsync(
    payload: object,
    options: JwtSignInput,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      jwt.sign(
        payload,
        options.secret,
        { expiresIn: options.expiresIn ?? '15m' } as jwt.SignOptions,
        (err, token) => {
          if (err || !token) reject(err ?? new Error('JWT sign failed'));
          else resolve(token);
        },
      );
    });
  }

  verifyAsync<T>(token: string, options: { secret: string }): Promise<T> {
    return new Promise((resolve, reject) => {
      jwt.verify(token, options.secret, (err, decoded) => {
        if (err) reject(err);
        else resolve(decoded as T);
      });
    });
  }
}
