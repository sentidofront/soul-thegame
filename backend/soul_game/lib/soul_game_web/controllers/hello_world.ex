defmodule SoulGameWeb.HelloWorld do
  use SoulGameWeb, :controller

  def index(conn, _params) do
    json(conn, %{message: "Hello, World!"})
  end
end
