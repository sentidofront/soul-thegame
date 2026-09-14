defmodule SoulGame.Repo do
  use Ecto.Repo,
    otp_app: :soul_game,
    adapter: Ecto.Adapters.Postgres
end
